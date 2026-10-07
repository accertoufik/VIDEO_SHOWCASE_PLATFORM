import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg } from '../config/ffmpeg';
import type { ContainerName } from '../config/azure';
import { AzureStorageService } from './azure-storage.service';
import { getDisplayDimensions } from '../lib/videoClassification';
import { SubtitleService } from './subtitle.service';

/**
 * The full quality ladder — the MAXIMUM set of rungs this platform will
 * ever produce for any video. 1440p is the hard ceiling by design: even a
 * 4K (2160p) upload never gets encoded above 1440p (a deliberate
 * cost/quality tradeoff — 1440p already covers the vast majority of
 * viewer displays, and going higher multiplies storage/encode time for
 * diminishing real-world benefit).
 *
 * The ladder is generated in TWO PHASES:
 *   - "standard" (480p + 720p) — generated first, in parallel, and is
 *     what makes a video watchable at all (status flips to READY once
 *     this and the thumbnail are done). A video can be published PUBLIC
 *     as soon as this phase is done — see VideoService.publish.
 *   - "hd" (1080p AND/OR 1440p, whichever apply) — generated afterward,
 *     in parallel with EACH OTHER, and appended to the SAME master
 *     manifest once ready. Purely additive: existing viewers/players
 *     aren't interrupted, the manifest just grows.
 * See selectStandardRungs() / selectHdRungs() below for the exact rules.
 */
const QUALITY_LADDER = [
  { label: '480p', width: 854, height: 480, bitrateKbps: 1400 },
  { label: '720p', width: 1280, height: 720, bitrateKbps: 2900 },
  { label: '1080p', width: 1920, height: 1080, bitrateKbps: 6000 },
  { label: '1440p', width: 2560, height: 1440, bitrateKbps: 10000 },
] as const;

type Rung = (typeof QUALITY_LADDER)[number];

/**
 * A ladder rung fitted to ONE specific source. The ladder labels ("480p",
 * "1080p") name the SHORTER side of the picture — YouTube's convention, so a
 * 1080x1920 Short is a "1080p" video. outWidth/outHeight are the real
 * pixel dimensions after preserving the source's aspect ratio.
 */

type SizedRung = Rung & {
  outWidth: number;
  outHeight: number;
};

//H.264 needs even dimensions, so we round down to the nearest even number.
const toEven = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

const sizeRungForSource = (rung: Rung, source: { width: number; height: number }): SizedRung => {
  const isPortrait = source.height > source.width;
  if (isPortrait) {
    const outWidth = rung.height;
    return { ...rung, outWidth, outHeight: toEven((outWidth * source.height) / source.width) };
  }

  //landscape/square: rung's number is the height, width is scaled to preserve aspect ratio.
  const outHeight = rung.height;
  return { ...rung, outWidth: toEven((outHeight * source.width) / source.height), outHeight };
};

/**
 * The 480p/720p half of the ladder:
 *   - Never upscale: a rung only generates if its height is <= source height.
 *   - A 720p (or taller) source gets [720p, 480p] — 720p native.
 *   - A 480p source gets [480p] only.
 *   - Anything smaller than 480p falls back to a single (slightly
 *     upscaled) 480p rung rather than leaving the video with zero
 *     playable rungs.
 */
const selectStandardRungs = (sourceShortsSide: number): Rung[] => {
  const effectiveMaxHeight = Math.min(sourceShortsSide, 720);
  const rungs = QUALITY_LADDER.filter(
    (rung) => rung.label === '480p' || rung.label === '720p',
  ).filter((rung) => rung.height <= effectiveMaxHeight);

  if (rungs.length === 0) return [QUALITY_LADDER[0]];
  return rungs;
};

/**
 * The HD half — now up to TWO rungs (1080p, 1440p), not just one.
 *   - Never upscale, same as always: a rung only generates if its height
 *     is <= source height.
 *   - Never exceed 1440p: a source above 1440p (e.g. 4K/2160p) still gets
 *     CAPPED at 1440p as its top rung (a downscale, never native above
 *     that) — min() below is what enforces this.
 *   - A source >= 1440p gets BOTH [1080p, 1440p] — 1440p native.
 *   - A source >= 1080p but < 1440p gets [1080p] only — 1080p native, no
 *     1440p (that would be upscaling).
 *   - A source below 1080p (720p, 480p) gets [] — empty. Its standard
 *     rungs already ARE its native/full quality; there's nothing above
 *     them to honestly generate.
 */
const selectHdRungs = (sourceShortsSide: number): Rung[] => {
  const effectiveMaxHeight = Math.min(sourceShortsSide, 1440);
  return QUALITY_LADDER.filter(
    (rung) => rung.label === '1080p' || rung.label === '1440p',
  ).filter((rung) => rung.height <= effectiveMaxHeight);
};

/**
 * FFmpeg is a command-line program — it reads and writes real files on
 * disk, it cannot read directly from an Azure Blob URL. So before we can
 * do anything, we have to pull the original video out of Blob Storage
 * and save it to a temp file on the worker's own disk.
 */
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
    await blockBlobClient.downloadToFile(destPath);
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
const runFfmpegEncode = async (
  inputPath: string,
  outputPath: string,
  rung: SizedRung,
) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      //.size(`${rung.width}x${rung.height}`)
      .videoFilters(`scale=${rung.outWidth}:${rung.outHeight}`)
      .videoBitrate(rung.bitrateKbps)
      .outputOptions(['-hls_time 6', '-hls_playlist_type vod', '-f', 'hls'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) =>
        reject(
          new Error(`FFmpeg encode failed for ${rung.label}:${err.message}`),
        ),
      )
      .run();
  });
};

/**
 * Probes a source file with ffprobe and returns both its video height
 * (used to select the quality ladder) and its duration in milliseconds
 * (used to size the adaptive notification grace window in the worker).
 */

interface RawProbeStream {
   codec_type?: string;
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


const probeSourceMetadata = async (
  inputPath: string,
): Promise<{ width: number;  height: number; durationMs: number }> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        reject(
          new Error(`ffprobe failed to read ${inputPath}: ${err.message}`),
        );
        return;
      }
      const videoStream = metadata.streams.find(
        (stream) => stream.codec_type === 'video',
      ) as unknown as RawProbeStream | undefined;

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

      resolve({ width: display.width, height: display.height, durationMs });
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
const masterManifestLine = (rung: SizedRung, withSubtitles = false) =>
  `#EXT-X-STREAM-INF:BANDWIDTH=${rung.bitrateKbps * 1000},RESOLUTION=${rung.outWidth}x${rung.outHeight}${withSubtitles ? ',SUBTITLES="subs"' : ''}\n${rung.label}/playlist.m3u8`;

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
      const updated = `${content}\n${missing.map((rung) => masterManifestLine(rung, withSubtitles)).join('\n')}`;

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
) => {
  const outputPath = join(workDir, `${rung.label}.m3u8`);
  await runFfmpegEncode(inputPath, outputPath, rung);

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
  }

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

/** Grabs a single frame from the video as a JPEG, 5 seconds in (skips black intro frames). */
const runFfmpegThumbnail = async (inputPath: string, outputFolder: string) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['5'],
        filename: 'thumbnail.jpg',
        folder: outputFolder,
      })
      .on('end', () => resolve())
      .on('error', (err) =>
        reject(new Error(`Failed to generate thumbnail: ${err.message}`)),
      );
  });
};

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

      const source = await probeSourceMetadata(inputPath);
      const sourceShortSide = Math.min(source.width, source.height);
      const rungs = selectStandardRungs(sourceShortSide).map((rung) => sizeRungForSource(rung, source));
      const baseName = originalBlobPath.replace(/[\/\.]/g, '-');

      const variants = await Promise.all(
        rungs.map((rung) =>
          encodeAndUploadRung(inputPath, workDir, baseName, rung),
        ),
      );

      const masterBlobPath = `${baseName}/master.m3u8`;
      // Uses the same race-safe upsert as the HD path — an HD rung's job
      // can genuinely reach master.m3u8 before this does now (see
      // WORKER_CONCURRENCY), so this can no longer assume it's always the
      // first writer.
      await upsertMasterManifest(masterBlobPath, rungs);

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
      const hdRungsNeeded = selectHdRungs(sourceShortSide).map((rung) => rung.label);

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
      const sourceShortSide = Math.min(source.width, source.height);
      const matchedRung =
        selectHdRungs(sourceShortSide).find(
          (candidate) => candidate.label === label,
        ) ?? null;

      // Nothing to do — the source doesn't qualify for this specific
      // rung (e.g. a 1200p source doesn't qualify for 1440p, or a 720p
      // source doesn't qualify for either). Not a failure.
      if (!matchedRung) return { added: false as const };

      const rung = sizeRungForSource(matchedRung, source);

      const baseName = originalBlobPath.replace(/[\/\.]/g, '-');
      const variant = await encodeAndUploadRung(
        inputPath,
        workDir,
        baseName,
        rung,
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
      await runFfmpegThumbnail(inputPath, workDir);
      const thumbnailContent = await readFile(join(workDir, 'thumbnail.jpg'));
      const baseName = originalBlobPath.replace(/[\/\.]/g, '-');
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
