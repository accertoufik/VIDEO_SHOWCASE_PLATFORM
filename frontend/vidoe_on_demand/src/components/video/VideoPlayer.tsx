import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEvent, useEventListener } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationBar } from 'expo-navigation-bar';
import { useScreenReader } from '@/lib/a11y/useScreenReader';
import { lockForFullscreenVideo, lockToPortrait } from '@/lib/orientation';
import { useFullscreenLayer } from './FullscreenHost';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { parseVtt, type Cue } from '@/lib/subtitles/vtt';
import { SubtitleOverlay } from './SubtitleOverlay';
import { VideoMiniProgress, VideoSeekBar } from './VideoSeekBar';
import { getPlaybackTicket, recordWatch, saveProgress, type ProgressBody } from '@/api/playback';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import { API_BASE_URL } from '@/lib/config';
import { useApi } from '@/lib/auth/useApi';
import type { VideoDetail, ViewerState } from '@/types/video';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveStreamQuality, usePreferences } from '@/lib/preferences';
import { toast } from '@/lib/toast';

type Props = {
  video: VideoDetail;
  viewer: ViewerState | null;
  onBack: () => void;
};

const PROGRESS_INTERVAL_MS = 15_000;
const MIN_RESUME_MS = 5_000; // don't bother resuming from the first few seconds
const COMPLETED_AT = 95; // percent
const SKIP_SECONDS = 5;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const speedLabel = (rate: number) => `${rate}x`;
const CONTROLS_HIDE_MS = 3_000;

/** "auto" = the adaptive master playlist. Otherwise a single rung, e.g. "720p". */
const streamUrl = (videoId: string, quality: string, ticket?: string) =>
  `${API_BASE_URL}/api/videos/${videoId}/stream/${quality === 'auto' ? 'master.m3u8' : `master-${quality}.m3u8`}${
    ticket ? `?pt=${ticket}` : ''
  }`;

// Full screen hides the phone's own navigation bar (Android's home / back buttons), which otherwise stays on one
// edge of the video when the phone is turned sideways. Swiping from that edge brings it back briefly.
const setImmersive = (on: boolean) => {
  if (Platform.OS !== 'android') return;
  try {
    NavigationBar.setHidden(on);
  } catch {
    // not available in this build: the video is still full screen
  }
};

const NO_TRACKS: never[] = [];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const CompatibleVideoView = VideoView as unknown as ComponentType<
  Record<string, unknown>
>;

export const VideoPlayer = ({ video, viewer, onBack }: Props) => {
  const insets = useSafeAreaInsets();
  const { isSignedIn, getToken } = useAuth();
  const api = useApi();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const prefs = usePreferences();
  // Start on the viewer's preferred quality when this video has it, otherwise adaptive.
  const [quality, setQuality] = useState(() =>
    resolveStreamQuality(
      prefs.preferredQuality,
      video.variants.filter((v) => v.ready).map((v) => v.label),
    ),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // The settings dropdown: a main list (Playback speed / Quality) that opens one option list at a time.
  const [menuPage, setMenuPage] = useState<'main' | 'quality' | 'speed' | 'subtitles' | 'audio'>('main');
  const [speed, setSpeed] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [ended, setEnded] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Where to seek once the player is ready, and whether to start playing. Set on first load and on a quality switch.
  const resumeMs =
    viewer?.progress &&
    !viewer.progress.completed &&
    viewer.progress.positionMs > MIN_RESUME_MS
      ? viewer.progress.positionMs
      : null;
  const pendingSeekSeconds = useRef<number | null>(
    resumeMs != null ? resumeMs / 1000 : null,
  );
  const autoplayNext = useRef(prefs.autoplay);
  const watchRecorded = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    // Keep ~30s buffered ahead, so a short hiccup (a busy server, a Wi-Fi blip, another device streaming on the same
    // network) is absorbed by the buffer instead of freezing the picture.
    try {
      p.bufferOptions = { preferredForwardBufferDuration: 30 };
    } catch {
      // option not supported on this platform: the default buffer is used
    }
  });

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
  } as never) as { currentTime: number };
  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });

  const watch = useMutation({
    mutationFn: () => recordWatch(api, video.id),
    meta: { silent: true },
  });
  const save = useMutation({
    mutationFn: (body: ProgressBody) => saveProgress(api, video.id, body),
    meta: { silent: true },
  });

  // ---- load / switch source ----
  // Public videos need nothing. A non-public one (the owner previewing a draft) gets a short-lived playback ticket from
  // the server, carried in the URL. The login must NOT be sent as a header: the player would also send it to storage for
  // every segment, and storage answers 400 to a request carrying both a signed link and an Authorization header (that
  // was why unpublished videos said "can't play"). A ticket also outlives the ~60 s login token.
  const needsAuth = video.visibility !== 'PUBLIC';
  const queryClient = useQueryClient();
  const ticketFor = useCallback(
    () =>
      queryClient.fetchQuery({
        queryKey: ['playback-ticket', video.id],
        queryFn: () => getPlaybackTicket(api, video.id),
        staleTime: 5 * 60 * 60_000,
      }),
    [queryClient, api, video.id],
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ticket = needsAuth && isSignedIn ? await ticketFor() : undefined;
        if (cancelled) return;
        setLoadFailed(false);
        await player.replaceAsync({ uri: streamUrl(video.id, quality, ticket) });
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, video.id, quality, needsAuth, isSignedIn, attempt, ticketFor]);

  // Captions. The video's master playlist lists any subtitle tracks that came inside the uploaded file; we read that
  // list, download the chosen track's WebVTT ourselves and draw it (SubtitleOverlay) in our own style. The player's
  // built-in caption rendering can't be styled, so it stays off.
  type Caption = { key: string; label: string; vttPath: string };
  const [captionKey, setCaptionKey] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const cueCache = useRef(new Map<string, Cue[]>());

  // Subtitle delay (seconds): some files have captions timed a little off their soundtrack. Remembered per video.
  const [subDelay, setSubDelay] = useState(0);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`vod.subDelay.${video.id}`)
      .then((raw) => {
        const n = Number(raw);
        if (alive && raw != null && Number.isFinite(n)) setSubDelay(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [video.id]);
  const changeSubDelay = (next: number) => {
    const value = Math.round(Math.max(-10, Math.min(10, next)) * 10) / 10;
    setSubDelay(value);
    AsyncStorage.setItem(`vod.subDelay.${video.id}`, String(value)).catch(() => {});
  };

  const captionTracks = useQuery({
    queryKey: ['captions', video.id],
    queryFn: async (): Promise<Caption[]> => {
      const ticket = needsAuth && isSignedIn ? await ticketFor() : undefined;
      const res = await fetch(`${streamUrl(video.id, 'auto')}?subs=1${ticket ? `&pt=${ticket}` : ''}`);
      if (!res.ok) return [];
      return (await res.text())
        .split('\n')
        .filter((line) => line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'))
        .map((line) => {
          const uri = /URI="([^"]*)"/.exec(line)?.[1] ?? '';
          return {
            key: uri,
            label: /NAME="([^"]*)"/.exec(line)?.[1] ?? 'Subtitles',
            vttPath: uri.replace(/\.m3u8$/, '.vtt'),
          };
        })
        .filter((track) => track.vttPath);
    },
    enabled: video.hasStream,
    staleTime: 10 * 60_000,
  });
  // A constant empty list: a fresh `[]` each render made the effect below re-run forever (it depends on this list).
  const subtitleTracks = captionTracks.data ?? NO_TRACKS;

  // Never the built-in caption rendering (it would draw a second, boxed copy under ours). The server already leaves
  // the subtitle group out of the playlist the player loads; this is the second lock, in case a phone's own
  // "captions on" accessibility setting selects a track anyway.
  const forceNativeCaptionsOff = useCallback(() => {
    try {
      if (player.subtitleTrack) player.subtitleTrack = null;
    } catch {
      // player already released
    }
  }, [player]);
  useEffect(forceNativeCaptionsOff, [forceNativeCaptionsOff]);
  useEventListener(player, 'availableSubtitleTracksChange', forceNativeCaptionsOff);

  // The quality the player is showing right now. On "Auto" it moves with the connection speed, so the menu can say
  // which one Auto has picked ("Auto · 720p"). null until the player reports its first track.
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    const h = videoTrack?.size?.height;
    setLiveHeight(h && h > 0 ? h : null);
  });
  useEventListener(player, 'subtitleTrackChange', forceNativeCaptionsOff);

  // Audio languages. A file with dual audio lists them in the master playlist; the player reports them here.
  // Only shown when there is a real choice (two or more).
  const readAudio = useCallback(() => {
    try {
      const list = (player.availableAudioTracks ?? []).map((t, i) => ({
        key: String(t.id ?? i),
        label: t.label || t.language || `Track ${i + 1}`,
      }));
      const current = player.audioTrack;
      const idx = current ? (player.availableAudioTracks ?? []).findIndex((t) => t.id === current.id) : -1;
      return { list, activeKey: idx >= 0 ? list[idx]?.key ?? null : null };
    } catch {
      return { list: [], activeKey: null as string | null };
    }
  }, [player]);
  const [audio, setAudio] = useState(readAudio);
  useEffect(() => setAudio(readAudio()), [readAudio]);
  useEventListener(player, 'availableAudioTracksChange', () => setAudio(readAudio()));
  useEventListener(player, 'audioTrackChange', () => setAudio(readAudio()));
  const pickAudio = (key: string) => {
    try {
      const track = (player.availableAudioTracks ?? []).find((t, i) => String(t.id ?? i) === key);
      if (track) player.audioTrack = track;
    } catch {
      // player already released
    }
    setAudio(readAudio());
  };

  useEffect(() => {
    const track = subtitleTracks.find((t) => t.key === captionKey);
    if (!track) {
      setCues((prev) => (prev.length ? [] : prev)); // keep the same array when already empty: no re-render
      return;
    }
    const cached = cueCache.current.get(track.key);
    if (cached) {
      setCues(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ticket = needsAuth && isSignedIn ? await ticketFor() : undefined;
        const res = await fetch(
          `${API_BASE_URL}/api/videos/${video.id}/stream/${track.vttPath}${ticket ? `?pt=${ticket}` : ''}`,
        );
        if (!res.ok) return;
        const parsed = parseVtt(await res.text());
        cueCache.current.set(track.key, parsed);
        if (!cancelled) setCues(parsed);
      } catch {
        // captions are optional: playback carries on without them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captionKey, subtitleTracks, video.id, needsAuth, isSignedIn, ticketFor]);

  const trackKey = (track: Caption) => track.key;
  const subtitleLang = captionKey;
  const setSubtitleLang = setCaptionKey;

  // Only the video the viewer is looking at may play. Opening another video (e.g. from "Up next") leaves this
  // screen mounted underneath; without this both would play at once. Also stops a slow-loading video from
  // starting after the viewer has already moved on.
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  useEffect(() => {
    if (focused) return;
    try {
      player.pause();
    } catch {
      // player already released
    }
    setMenuOpen(false);
  }, [focused, player]);

  // Playback speed belongs to the viewer's choice, not to one source: re-apply it whenever it changes and after
  // each (re)load, since a new source can reset it.
  useEffect(() => {
    try {
      player.playbackRate = speed;
    } catch {
      // player already released
    }
  }, [player, speed]);

  useEventListener(player, 'statusChange', ({ status: next }) => {
    if (next !== 'readyToPlay') return;
    try {
      player.playbackRate = speed;
    } catch {
      // player already released
    }
    if (pendingSeekSeconds.current != null) {
      player.currentTime = pendingSeekSeconds.current;
      pendingSeekSeconds.current = null;
    }
    if (autoplayNext.current && focusedRef.current) {
      autoplayNext.current = false;
      player.play();
    }
  });

  // ---- reporting ----
  const flushProgress = useCallback(() => {
    if (!isSignedIn) return;
    try {
      const positionMs = Math.floor(player.currentTime * 1000);
      if (positionMs <= 0) return;
      const durationMs =
        player.duration > 0 ? player.duration * 1000 : (video.durationMs ?? 0);
      const percent =
        durationMs > 0 ? clamp((positionMs / durationMs) * 100, 0, 100) : 0;
      save.mutate({
        positionMs,
        completionPercent: Math.round(percent * 100) / 100,
        completed: percent >= COMPLETED_AT,
      });
    } catch {
      // the native player may already be released (screen closing). Losing <15s of progress is acceptable.
    }
  }, [isSignedIn, player, video.durationMs, save]);
  const flushRef = useRef(flushProgress);
  flushRef.current = flushProgress;

  useEventListener(player, 'playToEnd', () => {
    // Only a real finish counts: near the end of a known-length video.
    const total = player.duration;
    if (total > 0 && player.currentTime >= total - 1.5) {
      setEnded(true);
      setControlsVisible(true); // show the replay button
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    if (playing) setEnded(false);
    if (playing && !watchRecorded.current && isSignedIn) {
      watchRecorded.current = true;
      watch.mutate();
    }
    if (!playing) flushRef.current();
  });

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => flushRef.current(), PROGRESS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushRef.current();
    });
    return () => subscription.remove();
  }, []);

  // ---- controls ----
  // Tap the video to show/hide the controls; they hide themselves a few seconds after playback continues.
  // Controls that vanish after 3 s can't be found by a screen-reader user: keep them up while one is running.
  const screenReaderOn = useScreenReader();
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (screenReaderOn) return;
    hideTimer.current = setTimeout(() => {
      // Keep the controls up while paused or finished, otherwise there's nothing to tap to resume.
      try {
        if (player.playing) setControlsVisible(false);
      } catch {
        // player already released
      }
    }, CONTROLS_HIDE_MS);
  }, [player, screenReaderOn]);
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const skip = (seconds: number) => {
    const duration = player.duration > 0 ? player.duration : Infinity;
    player.currentTime = clamp(player.currentTime + seconds, 0, duration);
    setEnded(false);
    showControls();
  };
  const togglePlay = () => {
    if (player.playing) {
      player.pause();
    } else if (
      ended ||
      (player.duration > 0 && player.currentTime >= player.duration - 0.5)
    ) {
      // A finished video ignores play(); it has to be replayed from the start.
      setEnded(false);
      player.replay();
    } else {
      player.play();
    }
    showControls();
  };

  const toggleMenu = () => {
    setMenuPage('main');
    setMenuOpen((open) => !open);
  };
  const pickSpeed = (rate: number) => {
    setSpeed(rate);
    setMenuOpen(false);
    setMenuPage('main');
  };

  // ---- quality ----
  const choose = (next: string) => {
    setMenuOpen(false);
    setMenuPage('main');
    if (next === quality) return;
    // Freeze the old stream first. Otherwise it keeps playing while the new rendition loads (a few seconds),
    // and we would then jump back to the position captured at the tap -- it looks like the video skipped.
    const resumeAt = player.currentTime;
    autoplayNext.current = player.playing;
    player.pause();
    pendingSeekSeconds.current = resumeAt; // continue from exactly the same moment on the new rendition
    setQuality(next);
  };

  const autoLabel = liveHeight ? `Auto · ${liveHeight}p` : 'Auto';
  const readyVariants = video.variants.filter((v) => v.ready);
  const options = [
    { key: 'auto', label: autoLabel },
    ...readyVariants.map((v) => ({ key: v.label, label: v.label })),
  ];

  // Tell the viewer when a better rendition shows up. The player itself is NOT restarted:
  // the menu simply gains the new rung, and picking it keeps the current position.
  const readyKey = readyVariants.map((v) => v.label).join('|');
  const knownRungs = useRef(new Set(readyKey ? readyKey.split('|') : []));
  useEffect(() => {
    const fresh = (readyKey ? readyKey.split('|') : []).filter(
      (label) => !knownRungs.current.has(label),
    );
    if (fresh.length === 0) return;
    fresh.forEach((label) => knownRungs.current.add(label));
    // Variants are sorted tallest first, so fresh[0] is the best new one.
    toast.success(`${fresh[0]} is now available. Pick it from the quality menu.`);
  }, [readyKey]);

  const hdPending =
    video.hasStream && !video.hdReady && video.status !== 'FAILED';

  const aspectRatio =
    video.width && video.height
      ? clamp(video.width / video.height, 0.8, 2.4)
      : 16 / 9;
  const totalSeconds = player.duration > 0 ? player.duration : (video.durationMs ?? 0) / 1000;
  const buffering = status === 'loading' && !loadFailed;
  const failed = loadFailed || status === 'error';

  // Our own full screen (a Modal + a landscape lock) instead of the native one: the native player shows
  // fixed 15s skip buttons, has no quality menu, and only rotates if the phone's auto-rotate is on.
  const enterFullscreen = async () => {
    setMenuOpen(false);
    setMenuPage('main');
    setFullscreen(true);
    setImmersive(true);
    await lockForFullscreenVideo();
  };
  const exitFullscreen = async () => {
    setMenuOpen(false);
    setFullscreen(false);
    setImmersive(false);
    await lockToPortrait();
  };
  useEffect(
    () => () => {
      setImmersive(false);
      void lockToPortrait();
    },
    [],
  );

  // The thumbnail stands in until the first frame is ready, then the video takes over. Gone if playback failed.
  const showPoster =
    status !== 'readyToPlay' && !isPlaying && !failed && Boolean(video.thumbnailUrl);

  const surface = (
    <>
      <CompatibleVideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit='contain'
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture
      />
      {showPoster ? (
        <View style={StyleSheet.absoluteFill} pointerEvents='none'>
          <RemoteImage
            source={{ uri: video.thumbnailUrl as string }}
            style={StyleSheet.absoluteFill}
            contentFit='contain'
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}
    </>
  );

  const overlay = (isFull: boolean) => (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (controlsVisible ? setControlsVisible(false) : showControls())}
        accessibilityLabel='Show or hide video controls'
      />

      {buffering ? (
        <View style={styles.center} pointerEvents='none'>
          <ActivityIndicator size='large' color={colors.text.primary} />
        </View>
      ) : null}

      {cues.length > 0 ? (
        <SubtitleOverlay
          player={player}
          cues={cues}
          fontSize={isFull ? 22 : 15}
          // Sit above the seek bar while the controls are showing.
          bottomOffset={controlsVisible ? 64 : 18}
          delaySeconds={subDelay}
        />
      ) : null}

      {controlsVisible && !failed && !menuOpen ? (
        <View style={styles.controls} pointerEvents='box-none'>
          <View style={styles.controlRow} pointerEvents='box-none'>
            <GlassIconButton
              icon='play-back'
              materialIcon='replay-5'
              label={`Back ${SKIP_SECONDS} seconds`}
              size='lg'
              onPress={() => skip(-SKIP_SECONDS)}
            />
            <GlassIconButton
              icon={ended ? 'refresh' : isPlaying || status === 'loading' ? 'pause' : 'play'}
              label={ended ? 'Replay' : isPlaying || status === 'loading' ? 'Pause' : 'Play'}
              size='lg'
              onPress={togglePlay}
            />
            <GlassIconButton
              icon='play-forward'
              materialIcon='forward-5'
              label={`Forward ${SKIP_SECONDS} seconds`}
              size='lg'
              onPress={() => skip(SKIP_SECONDS)}
            />
          </View>
          <View style={styles.bottomBar} pointerEvents='box-none'>
            <VideoSeekBar
              currentTime={currentTime}
              duration={totalSeconds}
              onSeek={(seconds) => {
                player.currentTime = seconds;
                setEnded(false);
                showControls();
              }}
              onScrub={showControls}
            />
            <GlassIconButton
              icon={isFull ? 'contract' : 'expand'}
              label={isFull ? 'Exit full screen' : 'Full screen'}
              size='sm'
              onPress={isFull ? exitFullscreen : enterFullscreen}
            />
          </View>
        </View>
      ) : null}

      {!controlsVisible && !failed && !isFull ? (
        <VideoMiniProgress currentTime={currentTime} duration={totalSeconds} />
      ) : null}

      {failed ? (
        <View style={[styles.center, styles.error]}>
          <AppText variant='title'>Couldn't play this video</AppText>
          <GlassButton
            label='Try again'
            size='sm'
            onPress={() => {
              pendingSeekSeconds.current = null;
              autoplayNext.current = true;
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : null}

      <View style={styles.topBar} pointerEvents='box-none'>
        <GlassIconButton
          icon={isFull ? 'chevron-down' : 'chevron-back'}
          label={isFull ? 'Exit full screen' : 'Go back'}
          onPress={isFull ? exitFullscreen : onBack}
        />
        <GlassIconButton
          icon='settings-outline'
          label={`Settings. Speed ${speedLabel(speed)}, quality ${quality === 'auto' ? `automatic${liveHeight ? `, now ${liveHeight}p` : ''}` : quality}`}
          onPress={toggleMenu}
        />
      </View>
    </>
  );

  const closeSettings = () => {
    setMenuOpen(false);
    setMenuPage('main');
  };

  // YouTube-style settings: a bottom sheet over the whole screen (so it is never cut off by the small player),
  // with two options, Quality and Playback speed. Nothing scrolls.
  const sheetBody = (
      <View style={styles.sheetRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeSettings}
          accessibilityLabel='Close settings'
        />
        <GlassSurface variant='strong' radius='xl' style={[styles.sheet, { marginBottom: spacing.md + insets.bottom }]}>
          {menuPage === 'main' ? (
            <>
              <AppText variant='label' color='muted' style={styles.sheetTitle}>
                Settings
              </AppText>
              <Pressable
                onPress={() => setMenuPage('quality')}
                style={styles.sheetRow}
                accessibilityRole='menuitem'
                accessibilityLabel={`Quality, ${quality === 'auto' ? `automatic${liveHeight ? `, now ${liveHeight}p` : ''}` : quality}`}
              >
                <Ionicons name='options-outline' size={22} color={colors.text.secondary} />
                <AppText variant='title' style={styles.sheetRowLabel}>
                  Quality
                </AppText>
                <AppText variant='body' color='muted'>
                  {quality === 'auto' ? autoLabel : quality}
                </AppText>
                <Ionicons name='chevron-forward' size={18} color={colors.text.muted} />
              </Pressable>
              <Pressable
                onPress={() => setMenuPage('speed')}
                style={styles.sheetRow}
                accessibilityRole='menuitem'
                accessibilityLabel={`Playback speed, ${speedLabel(speed)}`}
              >
                <Ionicons name='speedometer-outline' size={22} color={colors.text.secondary} />
                <AppText variant='title' style={styles.sheetRowLabel}>
                  Playback speed
                </AppText>
                <AppText variant='body' color='muted'>
                  {speed === 1 ? 'Normal' : speedLabel(speed)}
                </AppText>
                <Ionicons name='chevron-forward' size={18} color={colors.text.muted} />
              </Pressable>
              {audio.list.length > 1 ? (
                <Pressable
                  onPress={() => setMenuPage('audio')}
                  style={styles.sheetRow}
                  accessibilityRole='menuitem'
                  accessibilityLabel='Audio language'
                >
                  <Ionicons name='volume-high-outline' size={22} color={colors.text.secondary} />
                  <AppText variant='title' style={styles.sheetRowLabel}>
                    Audio
                  </AppText>
                  <AppText variant='body' color='muted'>
                    {audio.list.find((a) => a.key === audio.activeKey)?.label ?? ''}
                  </AppText>
                  <Ionicons name='chevron-forward' size={18} color={colors.text.muted} />
                </Pressable>
              ) : null}
              {subtitleTracks.length > 0 ? (
                <Pressable
                  onPress={() => setMenuPage('subtitles')}
                  style={styles.sheetRow}
                  accessibilityRole='menuitem'
                  accessibilityLabel={`Subtitles, ${subtitleLang ? 'on' : 'off'}`}
                >
                  <Ionicons name='chatbox-ellipses-outline' size={22} color={colors.text.secondary} />
                  <AppText variant='title' style={styles.sheetRowLabel}>
                    Subtitles
                  </AppText>
                  <AppText variant='body' color='muted'>
                    {subtitleLang
                      ? (subtitleTracks.find((t) => trackKey(t) === subtitleLang)?.label ?? 'On')
                      : 'Off'}
                  </AppText>
                  <Ionicons name='chevron-forward' size={18} color={colors.text.muted} />
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setMenuPage('main')}
                style={styles.sheetRow}
                accessibilityRole='button'
                accessibilityLabel='Back to settings'
              >
                <Ionicons name='chevron-back' size={22} color={colors.text.secondary} />
                <AppText variant='title' style={styles.sheetRowLabel}>
                  {menuPage === 'speed'
                    ? 'Playback speed'
                    : menuPage === 'subtitles'
                      ? 'Subtitles'
                      : menuPage === 'audio'
                        ? 'Audio'
                        : 'Quality'}
                </AppText>
              </Pressable>
              {menuPage === 'audio' ? (
                <>
                  {audio.list.map((option) => {
                    const selected = audio.activeKey === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        onPress={() => {
                          pickAudio(option.key);
                          closeSettings();
                        }}
                        style={styles.sheetRow}
                        accessibilityRole='menuitem'
                        accessibilityState={{ selected }}
                      >
                        <AppText variant='title' color={selected ? 'accent' : 'primary'} style={styles.sheetRowLabel}>
                          {option.label}
                        </AppText>
                        {selected ? <Ionicons name='checkmark' size={20} color={colors.accent.text} /> : null}
                      </Pressable>
                    );
                  })}
                </>
              ) : menuPage === 'subtitles' ? (
                <>
                  {[{ key: '', label: 'Off' }, ...subtitleTracks.map((t) => ({ key: trackKey(t), label: t.label }))].map(
                    (option) => {
                      const selected = (subtitleLang ?? '') === option.key;
                      return (
                        <Pressable
                          key={option.key || 'off'}
                          onPress={() => {
                            setSubtitleLang(option.key || null);
                            closeSettings();
                          }}
                          style={styles.sheetRow}
                          accessibilityRole='menuitem'
                          accessibilityState={{ selected }}
                        >
                          <AppText
                            variant='title'
                            color={selected ? 'accent' : 'primary'}
                            style={styles.sheetRowLabel}
                          >
                            {option.label}
                          </AppText>
                          {selected ? (
                            <Ionicons name='checkmark' size={20} color={colors.accent.text} />
                          ) : null}
                        </Pressable>
                      );
                    },
                  )}
                  {subtitleTracks.length > 0 ? (
                    <View style={styles.delayRow} accessibilityRole='adjustable' accessibilityLabel={`Subtitle delay ${subDelay > 0 ? 'plus' : subDelay < 0 ? 'minus' : ''} ${Math.abs(subDelay)} seconds`}>
                      <AppText variant='title' style={styles.sheetRowLabel}>
                        Subtitle delay
                      </AppText>
                      <Pressable onPress={() => changeSubDelay(subDelay - 0.1)} hitSlop={8} accessibilityRole='button' accessibilityLabel='Show subtitles earlier'>
                        <Ionicons name='remove-circle-outline' size={30} color={colors.text.primary} />
                      </Pressable>
                      <AppText variant='body' style={styles.delayValue}>
                        {subDelay > 0 ? '+' : ''}
                        {subDelay.toFixed(1)} s
                      </AppText>
                      <Pressable onPress={() => changeSubDelay(subDelay + 0.1)} hitSlop={8} accessibilityRole='button' accessibilityLabel='Show subtitles later'>
                        <Ionicons name='add-circle-outline' size={30} color={colors.text.primary} />
                      </Pressable>
                    </View>
                  ) : null}
                  {subDelay !== 0 ? (
                    <Pressable onPress={() => changeSubDelay(0)} style={styles.sheetRow} accessibilityRole='button'>
                      <AppText variant='bodySmall' color='accent' style={styles.sheetRowLabel}>
                        Reset delay
                      </AppText>
                    </Pressable>
                  ) : null}
                </>
              ) : menuPage === 'speed' ? (
                <View style={styles.speedGrid}>
                  {SPEEDS.map((rate) => (
                    <Pressable
                      key={rate}
                      onPress={() => pickSpeed(rate)}
                      style={[styles.speedChip, rate === speed && styles.speedChipOn]}
                      accessibilityRole='menuitem'
                      accessibilityState={{ selected: rate === speed }}
                    >
                      <AppText variant='title' color={rate === speed ? 'accent' : 'primary'}>
                        {speedLabel(rate)}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <>
                  {options.map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => choose(option.key)}
                      style={styles.sheetRow}
                      accessibilityRole='menuitem'
                      accessibilityState={{ selected: option.key === quality }}
                    >
                      <AppText
                        variant='title'
                        color={option.key === quality ? 'accent' : 'primary'}
                        style={styles.sheetRowLabel}
                      >
                        {option.label}
                      </AppText>
                      {option.key === quality ? (
                        <Ionicons name='checkmark' size={20} color={colors.accent.text} />
                      ) : null}
                    </Pressable>
                  ))}
                  {hdPending ? (
                    <AppText variant='caption' color='muted' style={styles.sheetTitle}>
                      HD isn't available yet
                    </AppText>
                  ) : null}
                </>
              )}
            </>
          )}
        </GlassSurface>
      </View>
  );

  const settingsSheet = fullscreen ? (
    // Full screen: an overlay, not a Modal (a Modal would bring the system navigation buttons back).
    menuOpen ? <View style={StyleSheet.absoluteFill}>{sheetBody}</View> : null
  ) : (
    <Modal
      transparent
      visible={menuOpen}
      animationType='fade'
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={closeSettings}
    >
      {sheetBody}
    </Modal>
  );

  // Full screen is drawn by the app-level host (see FullscreenHost), not in a Modal.
  useFullscreenLayer(
    fullscreen,
    <View style={styles.full}>
      <StatusBar hidden />
      {surface}
      {overlay(true)}
      {settingsSheet}
    </View>,
  );

  return (
    <View style={[styles.root, { aspectRatio }]}>
      {fullscreen ? null : surface}
      {fullscreen ? null : overlay(false)}
      {fullscreen ? null : settingsSheet}

    </View>
  );
};

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 440,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetTitle: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  delayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  delayValue: { minWidth: 64, textAlign: 'center' },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
  sheetRowLabel: { flex: 1 },
  full: { flex: 1, backgroundColor: colors.player.stage },
  root: { width: '100%', backgroundColor: colors.background.player },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl },
  bottomBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  error: { gap: spacing.md, backgroundColor: colors.overlay.scrimStrong },
  topBar: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menu: {
    position: 'absolute',
    top: spacing.sm + 52,
    right: spacing.md,
    minWidth: 200,
    borderRadius: radii.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 36,
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  speedChip: {
    width: '30.5%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface.glassMedium,
  },
  speedChipOn: { backgroundColor: colors.accent.primarySoft },
  menuRowLabel: { flex: 1 },
  menuHint: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
});
