import { languageInfo, uniqueTrackNames, hlsText } from './languages';

/**
 * Audio tracks of an uploaded file (a "dual audio" release has e.g. Japanese + English). The DEFAULT track stays in
 * every video rung exactly as before (so older videos and offline downloads keep working); every OTHER track is
 * published as its own audio-only HLS playlist and listed in master.m3u8 as an alternate audio rendition.
 */
export const MAX_AUDIO_TRACKS = 4;
export const AUDIO_GROUP = 'aud';

export type ProbedAudioStream = {
  index: number;
  codec_name?: string;
  channels?: number;
  tags?: Record<string, string | undefined>;
  disposition?: { default?: number };
};

export type AudioTrack = {
  /** Absolute stream index in the file, for ffmpeg's -map 0:<index>. */
  index: number;
  /** Short language code for HLS ("ja"), or "und". */
  code: string;
  name: string;
  isDefault: boolean;
};

export const pickAudioTracks = (streams: ProbedAudioStream[]): { primary: AudioTrack | null; extras: AudioTrack[] } => {
  const audio = [...streams].sort((a, b) => a.index - b.index);
  if (audio.length === 0) return { primary: null, extras: [] };

  // The track the file marks as default; otherwise the first one. NOT ffmpeg's own pick (the most channels), which
  // would silently choose a 5.1 dub over the original stereo language.
  const primaryStream = audio.find((s) => s.disposition?.default === 1) ?? audio[0]!;
  const rest = audio.filter((s) => s.index !== primaryStream.index);
  const ordered = [primaryStream, ...rest].slice(0, MAX_AUDIO_TRACKS);

  const names = uniqueTrackNames(
    ordered.map((s) => ({ language: s.tags?.language, title: s.tags?.title })),
    'Audio',
  );
  const tracks: AudioTrack[] = ordered.map((s, i) => ({
    index: s.index,
    code: languageInfo(s.tags?.language)?.code ?? 'und',
    name: names[i] ?? `Audio ${i + 1}`,
    isDefault: i === 0,
  }));
  return { primary: tracks[0] ?? null, extras: tracks.slice(1) };
};

/** The playlist file for the Nth extra audio track (N from 1): "audio/a1.m3u8". */
export const extraAudioPlaylist = (n: number) => `audio/a${n}.m3u8`;

/** The master-playlist lines that declare the audio group: the default (inside the video rungs) and the extras. */
export const audioMediaLines = (primary: AudioTrack, extras: AudioTrack[]): string[] => [
  `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${AUDIO_GROUP}",NAME="${hlsText(primary.name)}",LANGUAGE="${primary.code}",DEFAULT=YES,AUTOSELECT=YES`,
  ...extras.map(
    (t, i) =>
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${AUDIO_GROUP}",NAME="${hlsText(t.name)}",LANGUAGE="${t.code}",DEFAULT=NO,AUTOSELECT=YES,URI="${extraAudioPlaylist(i + 1)}"`,
  ),
];

export const masterHasAudioGroup = (master: string) => master.includes(`GROUP-ID="${AUDIO_GROUP}"`);

/**
 * Adds the audio group to the text of a master playlist and points every rung at it. Safe to apply twice (a
 * retried job): once the group is there, the text is returned unchanged.
 */
export const addAudioGroupToMaster = (master: string, mediaLines: string[]): string => {
  if (masterHasAudioGroup(master)) return master;
  const out: string[] = [];
  for (const line of master.split('\n')) {
    if (line.startsWith('#EXTM3U')) {
      out.push(line, ...mediaLines);
    } else if (line.startsWith('#EXT-X-STREAM-INF') && !line.includes('AUDIO=')) {
      out.push(`${line},AUDIO="${AUDIO_GROUP}"`);
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
};
