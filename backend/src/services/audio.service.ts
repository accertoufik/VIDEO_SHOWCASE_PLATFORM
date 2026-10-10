import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ffmpeg } from '../config/ffmpeg';
import { addAudioGroupToMaster, audioMediaLines, extraAudioPlaylist, type AudioTrack } from '../lib/audioTracks';
import { runCommand, throwIfCancelled } from '../lib/jobContext';
import { AzureStorageService } from './azure-storage.service';

/**
 * Alternate audio tracks ("dual audio": e.g. Japanese + English). The file's default track stays muxed in every video
 * rung. Each OTHER track is encoded once here as audio-only HLS (stereo AAC), uploaded under <video folder>/audio/,
 * and declared in master.m3u8 as an EXT-X-MEDIA audio rendition, so the player's audio menu can switch between them.
 */
const AUDIO_KBPS = 128;
const UPLOAD_PARALLEL = 8;

/** Start time (seconds on the segment's own clock) of the first stream of `kind` in a media file, or null. */
export const firstStreamStart = (path: string, kind: 'audio' | 'video') =>
  new Promise<number | null>((resolve) => {
    ffmpeg.ffprobe(path, (err, metadata) => {
      if (err) return resolve(null);
      const stream = metadata.streams.find((s) => s.codec_type === kind);
      const start = Number(stream?.start_time);
      resolve(Number.isFinite(start) ? start : null);
    });
  });

/**
 * Audio-only HLS starts its clock a few tens of milliseconds earlier than the audio inside the video files (the
 * video encoder's frame delay shifts that one). Left alone, an alternate track would play slightly AHEAD of the
 * picture. `shiftSeconds` moves the whole track later by the measured difference.
 */
const encodeAudioOnly = (inputPath: string, track: AudioTrack, slot: number, workDir: string, shiftSeconds = 0) =>
  runCommand(
    ffmpeg(inputPath)
      .output(join(workDir, `a${slot}.m3u8`))
      .outputOptions([
        ...(shiftSeconds > 0 ? ['-output_ts_offset', shiftSeconds.toFixed(4)] : []),
        '-map', `0:${track.index}`,
        '-vn',
        '-c:a', 'aac',
        '-b:a', `${AUDIO_KBPS}k`,
        '-ac', '2', // stereo, whatever the source layout (5.1 / 7.1 AAC is not reliably decoded on phones)
        '-ar', '48000',
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', join(workDir, `a${slot}_%d.ts`),
      ]),
    `FFmpeg audio encode failed for "${track.name}"`,
  );

const uploadAudioOutput = async (workDir: string, baseName: string, slot: number) => {
  const playlist = await readFile(join(workDir, `a${slot}.m3u8`), 'utf8');
  await AzureStorageService.uploadTextTyped('processed', `${baseName}/${extraAudioPlaylist(slot)}`, playlist, 'application/vnd.apple.mpegurl');

  const pattern = new RegExp(`^a${slot}_\\d+\\.ts$`);
  const files = (await readdir(workDir)).filter((f) => pattern.test(f));
  for (let i = 0; i < files.length; i += UPLOAD_PARALLEL) {
    throwIfCancelled();
    await Promise.all(
      files.slice(i, i + UPLOAD_PARALLEL).map(async (file) => {
        const content = await readFile(join(workDir, file));
        await AzureStorageService.getBlockBlobClient('processed', `${baseName}/audio/${file}`).upload(content, content.length);
      }),
    );
  }
  return files.length;
};

/** Adds the audio group to master.m3u8. Safe against concurrent writers (the HD job adds rungs to the same file). */
const addAudioToMaster = async (masterBlobPath: string, primary: AudioTrack, published: AudioTrack[]) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { content, etag } = await AzureStorageService.downloadTextWithEtag('processed', masterBlobPath);
    const updated = addAudioGroupToMaster(content, audioMediaLines(primary, published));
    if (updated === content) return; // already there (a retried job)
    try {
      await AzureStorageService.uploadTextIfMatch('processed', masterBlobPath, updated, etag);
      return;
    } catch (error: any) {
      if (error?.name === 'ConditionNotMetError' && attempt < 5) continue; // another writer got in first: re-read
      throw error;
    }
  }
};

export const AudioService = {
  /**
   * Encodes and publishes the extra tracks. Returns how many were published. Stops at the first track that fails, so
   * the playlist numbering (a1, a2, ...) always matches what was actually uploaded.
   */
  publishExtras: async (params: {
    inputPath: string;
    workDir: string;
    baseName: string;
    masterBlobPath: string;
    primary: AudioTrack;
    extras: AudioTrack[];
    /** The first segment of a video rung already encoded in workDir, to line the extra tracks up with its audio. */
    referenceSegment?: string;
  }): Promise<number> => {
    const referenceStart = params.referenceSegment ? await firstStreamStart(params.referenceSegment, 'audio') : null;
    const published: AudioTrack[] = [];
    for (const [i, track] of params.extras.entries()) {
      throwIfCancelled();
      const slot = i + 1;
      const started = Date.now();
      try {
        await encodeAudioOnly(params.inputPath, track, slot, params.workDir);
        if (referenceStart != null) {
          const ownStart = await firstStreamStart(join(params.workDir, `a${slot}_0.ts`), 'audio');
          const shift = ownStart == null ? 0 : referenceStart - ownStart;
          // Only worth a second (quick) pass when the gap is audible-ish; never shift earlier.
          if (shift > 0.01 && shift < 1) {
            await encodeAudioOnly(params.inputPath, track, slot, params.workDir, shift);
            console.log(`[audio] "${track.name}" shifted ${Math.round(shift * 1000)} ms to line up with the picture`);
          }
        }
        const segments = await uploadAudioOutput(params.workDir, params.baseName, slot);
        console.log(`[timing] audio "${track.name}": ${segments} segments in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        published.push(track);
      } catch (error) {
        if ((error as Error).name === 'JobCancelledError') throw error;
        console.warn(`Audio track "${track.name}" skipped:`, (error as Error).message);
        break;
      }
    }
    if (published.length === 0) return 0;
    await addAudioToMaster(params.masterBlobPath, params.primary, published);
    return published.length;
  },
};
