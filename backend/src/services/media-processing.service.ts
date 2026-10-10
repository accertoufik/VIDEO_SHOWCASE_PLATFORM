import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg } from '../config/ffmpeg';
import type { ContainerName } from '../config/azure';
import { AzureStorageService } from './azure-storage.service';
import { getDisplayDimensions } from '../lib/videoClassification';
import { SubtitleService } from './subtitle.service';
import { AudioService } from './audio.service';
import { mediaBaseName } from '../lib/mediaPaths';
import { pickAudioTracks, masterHasAudioGroup, AUDIO_GROUP, type ProbedAudioStream } from '../lib/audioTracks';
import { currentSignal, runCommand, throwIfCancelled } from '../lib/jobContext';
import {
  readEncodeOptions,
  selectHdRungs,
  selectStandardRungs,
  sizeRungForSource,
  sourceTierHeight,
  type EncodeOptions,
  type SizedRung,
} from '../lib/ladder';

export { readEncodeOptions, type EncodeOptions } from '../lib/ladder';

/**
 * FFmpeg is a command-line program — it reads and writes real files on
 * disk, it cannot read directly from an Azure Blob URL. So before we can
 * do anything, we have to pull the original video out of Blob Storage
 * and save it to a temp file on the worker's own disk.
 */
export { mediaBaseName };

/** Seconds with one decimal, for the [timing] log lines (read these to see where the time goes). */
const secs = (startMs: number) => ((Date.now() - startMs) / 1000).toFixed(1);

const downloadToTemp = async (
  container: ContainerName,
  blobPath: string,
  destPath: string,
) => {
  try {
    const blockBlobClient = AzureStorageService.getBlockBlobClient(
      container,
      blobPath,
    );
    const started = Date.now();
    await blockBlobClient.downloadToFile(destPath, 0, undefined, { abortSignal: currentSignal() });
    const bytes = (await stat(destPath)).size;
    const took = Math.max(0.001, (Date.now() - started) / 1000);
    console.log(
      `[timing] download ${blobPath}: ${(bytes / 1e6).toFixed(1)} MB in ${took.toFixed(1)}s (${(bytes / 1e6 / took).toFixed(1)} MB/s)`,
    );
  } catch (error) {
    throw new Error(
      `Failed to download blob ${blobPath} from container ${container}: ${error}`,
    );
  }
};

/**
 * Runs ONE FFmpeg encode: takes the original file and produces one rung
 * of the quality ladder as HLS (a .m3u8 playlist + several .ts segment
 * files sitting next to it in the same folder).
 */
const hlsOutputOptions = (preset: string) => [
  '-preset', preset,
  // Phone-safe output whatever the upload was: most phones have no hardware decoder for 10-bit H.264 ("High 10",
  // which 10-bit HEVC sources turn into) or for 5.1 AAC with an unknown channel layout. Force 8-bit High profile
  // and stereo audio, as every earlier (working) video had.
  '-pix_fmt', 'yuv420p',
  '-profile:v', 'high',
  '-ac', '2',
  '-hls_time', '6',
  '-hls_playlist_type', 'vod',
  '-f', 'hls',
];

/** Which streams of the source go into a rung: the real video stream and the file's default audio track. */
type StreamPick = { videoIndex: number; audioIndex: number | null };

/**
 * Adds one HLS rung output (its own scale, bitrate and playlist) to an FFmpeg command. The streams are mapped
 * EXPLICITLY: without that FFmpeg picks its own audio (the one with the most channels, e.g. an English 5.1 dub over
 * the original Japanese stereo) and could pick a cover-art picture as the "video".
 */
const addRungOutput = (command: ReturnType<typeof ffmpeg>, outputPath: string, rung: SizedRung, preset: string, pick: StreamPick) =>
  command
    .output(outputPath)
    .outputOptions(['-map', `0:${pick.videoIndex}`, ...(pick.audioIndex != null ? ['-map', `0:${pick.audioIndex}`] : [])])
    .videoCodec('libx264')
    .audioCodec('aac')
    .videoFilters(`scale=${rung.outWidth}:${rung.outHeight}`)
    .videoBitrate(rung.bitrateKbps)
    .outputOptions(hlsOutputOptions(preset));

const runFfmpegEncode = async (
  inputPath: string,
  outputPath: string,
  rung: SizedRung,
  pick: StreamPick,
  preset: string = readEncodeOptions().preset,
) => runCommand(addRungOutput(ffmpeg(inputPath), outputPath, rung, preset, pick), `FFmpeg encode failed for ${rung.label}`);

/**
 * ONE FFmpeg run with several outputs: the source is read and decoded once, then each rung scales and encodes its own
 * copy. Same files as running them one by one, for less total CPU.
 */
const runFfmpegEncodeTogether = async (
  inputPath: string,
  workDir: string,
  rungs: SizedRung[],
  pick: StreamPick,
  preset: string,
) => {
  const command = ffmpeg(inputPath);
  for (const rung of rungs) addRungOutput(command, join(workDir, `${rung.label}.m3u8`), rung, preset, pick);
  return runCommand(command, `FFmpeg encode failed for ${rungs.map((r) => r.label).join('+')}`);
};

/**
 * Probes a source file with ffprobe and returns both its video height
 * (used to select the quality ladder) and its duration in milliseconds
 * (used to size the adaptive notification grace window in the worker).
 */

interface RawProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  disposition?: { default?: number; attached_pic?: number };
  height?: number;
  width?: number;
  rotation?: string | number;
  tags?: Record<string, unknown>;
  side_data_list?: Array<Record<string, unknown>>;
}

//newer ffmpeg reports rotation in the display matrix side data; older files
//carry it as a "rotate" tag. check both.

const readRotation = (stream: RawProbeStream): number => {
  const displayMatrix = stream.side_data_list?.find((entry) => entry.side_data_type === 'Display Matrix');
  const degrees = Number(displayMatrix?.rotation ?? stream.tags?.rotate ?? 0);
  return Number.isFinite(degrees) ? degrees : 0;
};


export type SourceMetadata = {
  width: number;
  height: number;
  durationMs: number;
  bitrateKbps?: number;
  /** Absolute index of the real video stream (never an attached cover picture). */
  videoIndex: number;
  audioStreams: ProbedAudioStream[];
};

const probeSourceMetadata = async (inputPath: string): Promise<SourceMetadata> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(
          new Error(`ffprobe failed to read ${inputPath}: ${err.message}`),
        );
        return;
      }
      const videoStream = (metadata.streams as unknown as RawProbeStream[]).find(
        (stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1,
      );

      if (!videoStream?.width || !videoStream?.height) {
        reject(
          new Error(
            `ffprobe could not determine video height for "${inputPath}"`,
          ),
        );
        return;
      }

      const display = getDisplayDimensions(
        videoStream.width,
        videoStream.height,
        readRotation(videoStream),
      )

      const durationSeconds = Number(metadata.format?.duration ?? 0);
      const durationMs = Number.isFinite(durationSeconds)
        ? Math.round(durationSeconds * 1000)
        : 0;

      const bitsPerSecond = Number(metadata.format?.bit_rate ?? (videoStream as { bit_rate?: string | number }).bit_rate ?? 0);
      const bitrateKbps = Number.isFinite(bitsPerSecond) && bitsPerSecond > 0 ? Math.round(bitsPerSecond / 1000) : undefined;

      const audioStreams: ProbedAudioStream[] = (metadata.streams as unknown as RawProbeStream[])
        .filter((stream) => stream.codec_type === 'audio' && typeof stream.index === 'number')
        .map((stream) => ({
          index: stream.index as number,
          codec_name: stream.codec_name,
          channels: stream.channels,
          tags: stream.tags as Record<string, string | undefined> | undefined,
          disposition: stream.disposition,
        }));

      resolve({
        width: display.width,
        height: display.height,
        durationMs,
        bitrateKbps,
        videoIndex: videoStream.index ?? 0,
        audioStreams,
      });
    });
  });
};

/**
 * One line-pair in a master playlist, pointing at one rung's own playlist.
 * RESOLUTION must reflect the actual encoded pixels (outWidth/outHeight) —
 * for a portrait source those are swapped relative to the ladder's nominal
 * landscape width/height (e.g. a "1080p"-tier portrait Short encodes at
 * 1080x1920, not 1920x1080), so a player picking a rung by resolution sees
 * the real shape.
 */
const masterManifestLine = (rung: SizedRung, withSubtitles = false, withAudio = false) =>
  `#EXT-X-STREAM-INF:BANDWIDTH=${rung.bitrateKbps * 1000},RESOLUTION=${rung.outWidth}x${rung.outHeight}${withSubtitles ? ',SUBTITLES="subs"' : ''}${withAudio ? `,AUDIO="${AUDIO_GROUP}"` : ''}\n${rung.label}/playlist.m3u8`;

const buildMasterManifestText = (rungs: SizedRung[]) =>
  ['#EXTM3U', ...rungs.map((rung) => masterManifestLine(rung))].join('\n');

/**
 * Creates OR amends master.m3u8 to include the given rung(s), safely,
 * even when:
 *   (a) two rungs' jobs amend the SAME already-existing file at the SAME
 *       moment (1080p and 1440p can genuinely run concurrently — see
 *       WORKER_CONCURRENCY), and
 *   (b) the file doesn't exist YET at all, because with concurrent job
 *       dispatch TRANSCODE_STANDARD (which used to always write it first)
 *       can now be racing an HD rung's job rather than strictly
 *       preceding it — an HD job can reach this point before STANDARD's
 *       own encode has finished.
 *
 * This is an optimistic-concurrency retry loop, same shape as the atomic
 * Postgres updateMany() fixes elsewhere in this codebase, just at the
 * blob-storage layer:
 *   - Try to read the manifest + its ETag.
 *   - If it exists: merge in whichever of `rungs` aren't already listed,
 *     write back "only if the ETag still matches" — if another writer
 *     got there first (412), re-read and retry.
 *   - If it doesn't exist yet (404): try to CREATE it fresh with just
 *     `rungs` — "only if still nobody has created it" (Azure's
 *     ifNoneMatch:"*"). If another writer created it in that same
 *     instant, our create loses (409/412) and we just loop back to the
 *     read-and-amend path against what they wrote.
 */
const MAX_MANIFEST_UPSERT_ATTEMPTS = 5;

const upsertMasterManifest = async (
  masterBlobPath: string,
  rungs: SizedRung[],
): Promise<void> => {
  for (let attempt = 1; attempt <= MAX_MANIFEST_UPSERT_ATTEMPTS; attempt++) {
    try {
      const { content, etag } = await AzureStorageService.downloadTextWithEtag(
        'processed',
        masterBlobPath,
      );

      // Idempotency: only append rungs not already listed — covers a
      // retried job, or a rung another writer already merged in.
      const missing = rungs.filter(
        (rung) => !content.includes(`${rung.label}/playlist.m3u8`),
      );
      if (missing.length === 0) return;

      // If subtitles were already published into this master, new rungs must point at them too.
      const withSubtitles = content.includes('GROUP-ID="subs"');
      // Same for the alternate-audio group: a rung added later (HD) must point at it too.
      const withAudio = masterHasAudioGroup(content);
      const updated = `${content}\n${missing.map((rung) => masterManifestLine(rung, withSubtitles, withAudio)).join('\n')}`;

      try {
        await AzureStorageService.uploadTextIfMatch(
          'processed',
          masterBlobPath,
          updated,
          etag,
        );
        return; // won the write — done
      } catch (error: any) {
        if (
          error?.name === 'ConditionNotMetError' &&
          attempt < MAX_MANIFEST_UPSERT_ATTEMPTS
        ) {
          continue; // someone else amended first — re-read and try again
        }
        throw error;
      }
    } catch (error: any) {
      if (error?.name !== 'BlobNotFoundError') throw error;

      // The file doesn't exist yet — try to be the one who creates it.
      try {
        await AzureStorageService.uploadTextIfNotExists(
          'processed',
          masterBlobPath,
          buildMasterManifestText(rungs),
        );
        return; // won the create — done
      } catch (createError: any) {
        if (
          createError?.name === 'AlreadyExistsError' &&
          attempt < MAX_MANIFEST_UPSERT_ATTEMPTS
        ) {
          continue; // someone else created it in the meantime — re-read and amend
        }
        throw createError;
      }
    }
  }
};

/**
 * Encodes ONE rung end to end and uploads its output (playlist + every
 * segment file FFmpeg produced for it) to the "processed" container.
 * Shared by both the standard phase (called once per rung, in parallel)
 * and the HD phase (called once, alone).
 */
const encodeAndUploadRung = async (
  inputPath: string,
  workDir: string,
  baseName: string,
  rung: SizedRung,
  pick: StreamPick,
  preset: string = readEncodeOptions().preset,
) => {
  const outputPath = join(workDir, `${rung.label}.m3u8`);
  const encodeStart = Date.now();
  await runFfmpegEncode(inputPath, outputPath, rung, pick, preset);
  console.log(`[timing] ffmpeg ${rung.label} (${preset}, ${rung.bitrateKbps} kbps): ${secs(encodeStart)}s`);
  return uploadEncodedRung(workDir, baseName, rung, outputPath);
};

/** Uploads one already-encoded rung (its playlist and every segment) to the "processed" container. */
const uploadEncodedRung = async (
  workDir: string,
  baseName: string,
  rung: SizedRung,
  outputPath: string,
) => {
  const uploadStart = Date.now();
  let uploadedBytes = 0;
  let uploadedFiles = 0;

  const manifestBlobPath = `${baseName}/${rung.label}/playlist.m3u8`;
  const manifestContent = await readFile(outputPath, 'utf-8');
  await AzureStorageService.uploadText(
    'processed',
    manifestBlobPath,
    manifestContent,
  );

  // FFmpeg also wrote "480p0.ts", "480p1.ts", ... (or "720p0.ts", ...)
  // segment files into workDir alongside the playlist. Different rungs
  // use different filename prefixes, so it's safe for this to run
  // concurrently with another rung's encode sharing the same workDir —
  // their segment files never collide.
  const segmentPattern = new RegExp(`^${rung.label}\\d*\\.ts$`);
  const files = await readdir(workDir);
  for (const file of files.filter((f) => segmentPattern.test(f))) {
    throwIfCancelled(); // a deleted video stops uploading at once
    const segmentContent = await readFile(join(workDir, file));
    const segmentBlobPath = `${baseName}/${rung.label}/${file}`;
    const blockBlobClient = AzureStorageService.getBlockBlobClient(
      'processed',
      segmentBlobPath,
    );
    await blockBlobClient.upload(
      segmentContent,
      Buffer.byteLength(segmentContent),
    );
    uploadedBytes += segmentContent.length;
    uploadedFiles += 1;
  }
  console.log(
    `[timing] upload ${rung.label}: ${uploadedFiles} segments, ${(uploadedBytes / 1e6).toFixed(1)} MB in ${secs(uploadStart)}s`,
  );

  return {
    label: rung.label,
    // Actual encoded pixel size, not the ladder's nominal landscape
    // width/height — for a portrait source these are swapped (see
    // sizeRungForSource). This is what lands in the VideoVariant row.
    width: rung.outWidth,
    height: rung.outHeight,
    bitrateKbps: rung.bitrateKbps,
    blobPath: manifestBlobPath,
  };
};

/**
 * Where to grab the thumbnail frame: 5 seconds in (skips black intro frames), but for a clip shorter than 20 s a
 * quarter of the way in. A fixed 5 s seeks PAST the end of a short clip, which produced no frame at all and made
 * the thumbnail job (and so the whole video) fail.
 */
export const thumbnailSecond = (durationMs: number) => {
  const seconds = durationMs / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds >= 20 ? 5 : Math.round(seconds * 0.25 * 10) / 10;
};

/** Grabs a single frame from the video as a JPEG (see thumbnailSecond for where). */
const runFfmpegThumbnail = async (inputPath: string, outputFolder: string, source: SourceMetadata) =>
  runCommand(
    ffmpeg(inputPath)
      .seekInput(thumbnailSecond(source.durationMs))
      .output(join(outputFolder, 'thumbnail.jpg'))
      .outputOptions(['-map', `0:${source.videoIndex}`, '-frames:v', '1', '-q:v', '2']),
    'Failed to generate thumbnail',
  );

export const MediaProcessingService = {
  /**
   * PHASE 1 — the 480p/720p rungs. This is what makes a video watchable
   * at all: once this (and the thumbnail job) finish, the worker flips
   * the video to READY. The rungs are encoded with Promise.all — AT THE
   * SAME TIME rather than one after another — which is what actually
   * cuts wall-clock time versus the old sequential loop.
   */
  transcodeStandard: async (originalBlobPath: string) => {
    const workDir = await mkdtemp(join(tmpdir(), 'video-transcode-std-'));
    try {
      const inputPath = join(workDir, 'original.mp4');
      await downloadToTemp('originals', originalBlobPath, inputPath);

      const probeStart = Date.now();
      const source = await probeSourceMetadata(inputPath);
      console.log(`[timing] probe: ${secs(probeStart)}s (${source.width}x${source.height}, ${Math.round(source.durationMs / 1000)}s long)`);
      const tier = sourceTierHeight(source.width, source.height);
      const options = readEncodeOptions();
      const rungs = selectStandardRungs(tier).map((rung) => sizeRungForSource(rung, source, options));
      const baseName = mediaBaseName(originalBlobPath);
      // The file's default audio goes into every rung; any other audio tracks are published separately below.
      const { primary, extras } = pickAudioTracks(source.audioStreams);
      const pick: StreamPick = { videoIndex: source.videoIndex, audioIndex: primary?.index ?? null };
      if (source.audioStreams.length > 1) {
        console.log(`[audio] ${source.audioStreams.length} audio tracks: default "${primary?.name}", extras: ${extras.map((t) => t.name).join(', ') || 'none'}`);
      }

      let variants;
      if (options.singlePass && rungs.length > 1) {
        // One decode feeds every rung; then the finished rungs are uploaded.
        const started = Date.now();
        await runFfmpegEncodeTogether(inputPath, workDir, rungs, pick, options.preset);
        console.log(
          `[timing] ffmpeg ${rungs.map((r) => `${r.label} @${r.bitrateKbps}k`).join(' + ')} (single pass, ${options.preset}): ${secs(started)}s`,
        );
        variants = await Promise.all(
          rungs.map((rung) => uploadEncodedRung(workDir, baseName, rung, join(workDir, `${rung.label}.m3u8`))),
        );
      } else {
        variants = await Promise.all(
          rungs.map((rung) => encodeAndUploadRung(inputPath, workDir, baseName, rung, pick, options.preset)),
        );
      }

      const masterBlobPath = `${baseName}/master.m3u8`;
      // Uses the same race-safe upsert as the HD path — an HD rung's job
      // can genuinely reach master.m3u8 before this does now (see
      // WORKER_CONCURRENCY), so this can no longer assume it's always the
      // first writer.
      await upsertMasterManifest(masterBlobPath, rungs);

      // Other audio tracks (a "dual audio" file): each becomes an alternate audio rendition the player can switch to.
      // A failure here is not fatal: the video plays with its default audio.
      if (primary && extras.length > 0) {
        try {
          const published = await AudioService.publishExtras({
            inputPath,
            workDir,
            baseName,
            masterBlobPath,
            primary,
            extras,
            referenceSegment: join(workDir, `${rungs[0]?.label}0.ts`),
          });
          if (published > 0) console.log(`Published ${published} extra audio track(s) for ${originalBlobPath}`);
        } catch (error) {
          if ((error as Error).name === 'JobCancelledError') throw error;
          console.warn(`Extra audio skipped for ${originalBlobPath}:`, (error as Error).message);
        }
      }

      // Subtitle tracks inside the upload (e.g. an .mkv with English captions) become a captions menu in the player.
      try {
        const published = await SubtitleService.publish({
          inputPath,
          workDir,
          baseName,
          masterBlobPath,
          durationMs: source.durationMs,
        });
        if (published > 0) console.log(`Published ${published} subtitle track(s) for ${originalBlobPath}`);
      } catch (error) {
        console.warn(`Subtitle extraction skipped for ${originalBlobPath}:`, (error as Error).message);
      }

      // Tells the caller EXACTLY which HD rungs this source actually
      // qualifies for — e.g. a 1080p source qualifies for '1080p' only,
      // never '1440p' (that would be upscaling). The worker uses this to
      // skip the non-qualifying HD job(s) outright instead of letting
      // them download the whole source a second time and run ffprobe
      // just to discover the same thing themselves.
      const hdRungsNeeded = selectHdRungs(tier).map((rung) => rung.label);

      // width/height/durationMs travel back to the worker, which classifies + stores them.
      return {
        masterBlobPath,
        variants,
        hdRungsNeeded,
        durationMs: source.durationMs,
        width: source.width,
        height: source.height,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },

  /**
   * PHASE 2 — ONE HD rung at a time: either "1080p" or "1440p", picked by
   * the caller (see TRANSCODE_1080P / TRANSCODE_1440P in the worker).
   * These two are now separate jobs specifically so 1080p — smaller,
   * faster, and useful to nearly every viewer — can finish and be
   * announced without waiting on the slower, more niche 1440p rung. Runs
   * independently of the standard phase, and independently of the OTHER
   * HD rung's job too; both can genuinely execute at the same instant.
   *
   * Re-downloads and re-probes the source itself (this job may run on a
   * different worker tick than the standard phase or the other HD rung's
   * job, so it can't rely on either one's in-memory state).
   *
   * Creates or amends master.m3u8 via upsertMasterManifest() (see its
   * comment for how both the concurrent-amend race AND the
   * doesn't-exist-yet race are handled) — safe to call even while the
   * video is already PUBLIC and being watched, safe to call concurrently
   * with the OTHER HD rung's job amending the same file at the same
   * time, and safe to call even if TRANSCODE_STANDARD hasn't created the
   * manifest yet.
   */
  transcodeHdRung: async (
    originalBlobPath: string,
    label: '1080p' | '1440p',
  ) => {
    const workDir = await mkdtemp(join(tmpdir(), `video-transcode-${label}-`));
    try {
      const inputPath = join(workDir, 'original.mp4');
      await downloadToTemp('originals', originalBlobPath, inputPath);

      const source = await probeSourceMetadata(inputPath);
      const tier = sourceTierHeight(source.width, source.height);
      const matchedRung =
        selectHdRungs(tier).find(
          (candidate) => candidate.label === label,
        ) ?? null;

      // Nothing to do — the source doesn't qualify for this specific
      // rung (e.g. a 1200p source doesn't qualify for 1440p, or a 720p
      // source doesn't qualify for either). Not a failure.
      if (!matchedRung) return { added: false as const };

      const options = readEncodeOptions();
      const rung = sizeRungForSource(matchedRung, source, options);

      const baseName = mediaBaseName(originalBlobPath);
      // The same default audio track the standard rungs use, picked by the same rule from the same file.
      const { primary } = pickAudioTracks(source.audioStreams);
      const variant = await encodeAndUploadRung(
        inputPath,
        workDir,
        baseName,
        rung,
        { videoIndex: source.videoIndex, audioIndex: primary?.index ?? null },
        options.preset,
      );

      const masterBlobPath = `${baseName}/master.m3u8`;
      await upsertMasterManifest(masterBlobPath, [rung]);

      return { added: true as const, variant };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },

  /** The thumbnail pipeline — unchanged, only one output file, no ladder involved. */
  generateThumbnail: async (originalBlobPath: string) => {
    const workDir = await mkdtemp(join(tmpdir(), 'video-thumbnail-'));
    try {
      const inputPath = join(workDir, 'original.mp4');
      await downloadToTemp('originals', originalBlobPath, inputPath);
      await runFfmpegThumbnail(inputPath, workDir, await probeSourceMetadata(inputPath));
      const thumbnailContent = await readFile(join(workDir, 'thumbnail.jpg'));
      const baseName = mediaBaseName(originalBlobPath);
      const thumbnailBlobPath = `${baseName}/thumbnail.jpg`;
      const blockBlobClient = AzureStorageService.getBlockBlobClient(
        'thumbnails',
        thumbnailBlobPath,
      );
      await blockBlobClient.upload(
        thumbnailContent,
        Buffer.byteLength(thumbnailContent),
      );
      return thumbnailBlobPath;
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw error;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
};

/** Pieces the benchmark script reuses, so it measures exactly what the worker runs. */
export const EncodingForBenchmark = {
  probeSourceMetadata,
  selectStandardRungs,
  selectHdRungs,
  sizeRungForSource,
  runFfmpegEncode,
  runFfmpegEncodeTogether,
};
