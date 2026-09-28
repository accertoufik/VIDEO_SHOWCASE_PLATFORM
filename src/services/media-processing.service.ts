import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg } from '../config/ffmpeg';
import { prisma } from '../config/db';
import type { ContainerName } from '../config/azure';
import { AzureStorageService } from './azure-storage.service';

/**
 * The quality ladder: every rung is one resolution + bitrate we re-encode
 * the original video into. A viewer's app player picks whichever rung
 * currently fits their connection and can switch mid-playback. Kept to
 * two rungs for now to keep encode time and testing short — the full
 * plan calls for 240p up through 1080p/4K; add rungs here later, nothing
 * else needs to change.
 */

const QUALITY_LADDER = [
  { label: '480p', width: 854, height: 480, bitrateKbps: 1400 },
  { label: '720p', width: 1280, height: 720, bitrateKbps: 2800 },
  {label: '1080p', width: 1920, height: 1080, bitrateKbps: 5000 },
] as const;

/**
 * Decides which rungs to actually generate for ONE video, based on its
 * source height. The rule, in plain terms:
 *
 *   - Never upscale. A rung only gets generated if its height is <= the
 *     source's own height — encoding a 480p upload "up" to 720p would
 *     just be a blurry 720p file, not a real 720p video.
 *   - Never exceed 1080p, no matter how high the source is. A 1440p or
 *     4K upload gets capped at 1080p as its TOP rung (a downscale, not
 *     its native resolution) — we treat 1080p as the ceiling everyone
 *     streams at, full stop.
 *   - Below that cap, generate every rung at or under the source's
 *     height, so a video always has a ladder to step down to on a weak
 *     connection: a 1080p source gets [1080p, 720p, 480p] (three rungs,
 *     top one at native quality since source is exactly at the 1080p
 *     ceiling); a 720p source gets [720p, 480p] (two rungs, top one
 *     native — never generates a fake "1080p" that doesn't exist in the
 *     source); a 480p (or smaller) source gets just [480p] (one rung,
 *     native — there's nothing above it to safely generate).
 *
 * Example outcomes:
 *   4K (2160p) upload    -> [1080p, 720p, 480p]  (1080p is a downscale)
 *   1440p upload         -> [1080p, 720p, 480p]  (1080p is a downscale)
 *   1080p upload         -> [1080p, 720p, 480p]  (1080p is NATIVE)
 *   720p upload          -> [720p, 480p]         (720p is NATIVE)
 *   480p upload          -> [480p]               (480p is NATIVE)
 *   360p (small) upload  -> [480p]               (fallback — see below)
 */
const selectRungsForSource = (sourceHeight: number) => {
  // The ceiling: never generate anything above 1080p, even if the
  // source is bigger. min() is what turns a 4K/1440p source into a
  // capped-at-1080p top rung instead of trying to produce a 4K rung.
  const effectiveMaxHeight = Math.min(sourceHeight, 1080);
  const selectedRungs = QUALITY_LADDER.filter(
    (rung) => rung.height <= effectiveMaxHeight,
  );

  // Edge case: a source SMALLER than our smallest rung (480p) — e.g. an
  // old 360p or 240p upload. There's no rung we can generate without
  // upscaling at all, but a video with ZERO playable rungs is worse than
  // one slightly-upscaled 480p rung, so we fall back to the smallest rung
  // as a "best effort" rather than leaving the video unplayable.
  if (selectedRungs.length === 0) {
    return [QUALITY_LADDER[0]];
  }

  return selectedRungs;
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
  desPath: string,
) => {
  try {
    const blockBlobClient = AzureStorageService.getBlockBlobClient(
      container,
      blobPath,
    );
    await blockBlobClient.downloadToFile(desPath);
  } catch (error) {
    throw new Error(
      `Failed to download blob ${blobPath} from container ${container}: ${error}`,
    );
  }
};

/**
 * Runs ONE FFmpeg encode: takes the original file and produces one rung
 * of the quality ladder as HLS (a .m3u8 playlist + several .ts segment
 * files sitting next to it in the same folder). fluent-ffmpeg's methods
 * map directly to FFmpeg command-line flags:
 *   .videoCodec("libx264")   -> re-encode video with the H.264 codec
 *   .audioCodec("aac")       -> re-encode audio with AAC
 *   .size("1280x720")        -> scale the picture to this resolution
 *   .videoBitrate(2800)      -> target data rate for this rung, in kbps
 *   .outputOptions([...])    -> raw flags for things fluent-ffmpeg has no
 *                                 shortcut method for; here we ask for HLS
 *                                 output, 6-second segments, and a "video
 *                                 on demand" playlist (as opposed to a
 *                                 live/growing one)
 * This returns a Promise because fluent-ffmpeg is event-based (it fires
 * "end" or "error" whenever the child process finishes) — wrapping it in
 * `new Promise(...)` lets the rest of our code just `await` it normally.
 */

const runFfmpegEncode = async (
  inputPath: string,
  outputPath: string,
  rung: (typeof QUALITY_LADDER)[number],
) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .size(`${rung.width}x${rung.height}`)
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
}

  /**
   * Asks ffprobe "how tall (in pixels) is this video's picture?" — this is
   * the fact selectRungsForSource() needs before we can decide which rungs
   * to generate. ffprobe returns a big JSON blob describing every stream in
   * the file (video, audio, sometimes subtitles); we only care about the
   * first video stream's `height`.
   */

  const probeSourceHeight = async (inputPath: string) => {
    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(new Error(`ffprobe failed to read ${inputPath}: ${err.message}`));
          return;
        }
        const videoStream = metadata.streams.find(
          (stream) => stream.codec_type === 'video',
        );
        if (!videoStream || !videoStream.height) {
          reject(new Error('ffprobe could not determine video height for "${inputPath}"'));
          return;
        }
        resolve(videoStream.height);
      });
    });
  }



/**
 * Grabs a single frame from the video as a JPEG, 5 seconds in (skips
 * black intro frames a lot of videos start with). `.screenshots()` is
 * fluent-ffmpeg's shortcut for FFmpeg's "seek to a timestamp, decode one
 * frame, save it as an image" behavior.
 */

const runFfmpegThumbnail = async (inputPath: string, outputFolder: string) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['5'],
        filename: 'thumbnail.jpg',
        folder: outputFolder,
        // size: '320x240',
      })
      .on('end', () => resolve())
      .on('error', (err) =>
        reject(new Error(`Failed to generate thumbnail: ${err.message}`)),
      );
  });
};

export const MediaProcessingService = {
  /**
   * The full transcode pipeline for one video, start to finish:
   *   1. Make a scratch folder on local disk (mkdtemp — always a fresh,
   *      unique folder name, so concurrent jobs never collide).
   *   2. Download the original file from the "originals" container into it.
   *   3. Probe the source's own height with ffprobe, then decide which
   *      rungs to generate via selectRungsForSource() — never upscaling,
   *      never exceeding 1080p (see that function's comment for the
   *      exact rule).
   *   4. For each SELECTED rung: run FFmpeg (writes a playlist + segment
   *      files into the same scratch folder), then upload that
   *      playlist's text and every segment file it produced up to the
   *      "processed" container.
   *   5. Once every rung is done, write one more file ourselves (not
   *      FFmpeg's job) — the "master" playlist, which just lists all the
   *      rungs with their bandwidth/resolution so the player can choose.
   *   6. Delete the scratch folder — nothing from local disk should
   *      linger after this function returns, success or failure.
   */
  transcode: async (originalBlobPath: string) => {
    const workDir = await mkdtemp(join(tmpdir(), 'video-transcode-'));
    try {
      const inputPath = join(workDir, 'original.mp4');
      await downloadToTemp('originals', originalBlobPath, inputPath);

      
      // Find out how tall the source actually is BEFORE encoding anything —
      // this is what decides whether we generate one, two, or three rungs,
      // and whether the top rung is a downscale or the source's native size.
      const sourceHeight = await probeSourceHeight(inputPath);
      const rungsToGenerate = selectRungsForSource(sourceHeight);


      //turn the blob path into a safe folder name for our processed output
      //e.g. "creatorId/uuid.mp4" -> "creatorId-uid-mp4"
      const baseName = originalBlobPath.replace(/[\/\.]/g, '-');
      const variants: {
        label: string;
        width: number;
        height: number;
        bitrateKbps: number;
        blobPath: string;
      }[] = [];

      for (const rung of rungsToGenerate) {
        const outputPath = join(workDir, `${rung.label}.m3u8`);
        await runFfmpegEncode(inputPath, outputPath, rung);

        //upload this rung's playlist (a small text file lisitng all the .ts segments) to Azure
        const manifestBlobPath = `${baseName}/${rung.label}/playlist.m3u8`;
        const manifestContent = await readFile(outputPath, 'utf-8');
        await AzureStorageService.uploadText(
          'processed',
          manifestBlobPath,
          manifestContent,
        );

        //
        // FFmpeg also wrote a bunch of "480p0.ts", "480p1.ts", ... segment
        // files into workDir alongside the playlist — find them all and
        // upload each one next to its playlist in "processed".
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
        variants.push({ ...rung, blobPath: manifestBlobPath });
      }

      // The master playlist — FFmpeg never sees this, we build it by hand.
      // It's just a text file: for every rung, one line saying "here's its
      // bandwidth and resolution" and the next line pointing at that
      // rung's own playlist. A player reads this first and picks a rung.
      const masterManifest = [
        '#EXTM3U',
        ...rungsToGenerate.map(
          (rung) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${Number(rung.bitrateKbps) * 1000},RESOLUTION=${rung.width}x${rung.height}\n${rung.label}/playlist.m3u8`,
        ),
      ].join('\n');
      const masterBlobPath = `${baseName}/master.m3u8`;
      await AzureStorageService.uploadText(
        'processed',
        masterBlobPath,
        masterManifest,
      );

      return { masterBlobPath, variants };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },

  /**
   * The thumbnail pipeline — much shorter than transcode() because there's
   * only one output file and no quality ladder involved.
   */
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
