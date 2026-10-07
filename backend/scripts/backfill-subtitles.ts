/**
 * One-off: publishes the subtitle tracks embedded in an ALREADY-uploaded video (processed before subtitles were
 * supported). Downloads the original, extracts text subtitles to WebVTT, uploads them and lists them in the
 * video's master.m3u8. Nothing is re-encoded and nothing existing is replaced.
 *
 *   bun run scripts/backfill-subtitles.ts <videoId>
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/config/db";
import { AzureStorageService } from "../src/services/azure-storage.service";
import { SubtitleService } from "../src/services/subtitle.service";

const videoId = process.argv[2];
if (!videoId) {
  console.error("usage: bun run scripts/backfill-subtitles.ts <videoId>");
  process.exit(1);
}

const video = await prisma.video.findUnique({
  where: { id: videoId },
  include: { originalAsset: true, hlsManifestAsset: true },
});
if (!video?.originalAsset || !video.hlsManifestAsset) {
  console.error("Video not found, or it has no original / HLS output yet.");
  process.exit(1);
}

const masterBlobPath = video.hlsManifestAsset.blobPath;
const baseName = masterBlobPath.replace(/\/[^/]+$/, "");
const workDir = await mkdtemp(join(tmpdir(), "backfill-subs-"));
try {
  const inputPath = join(workDir, "original");
  console.log("Downloading the original…");
  await AzureStorageService.getBlockBlobClient("originals", video.originalAsset.blobPath).downloadToFile(inputPath);
  console.log("Extracting subtitles…");
  const count = await SubtitleService.publish({
    inputPath,
    workDir,
    baseName,
    masterBlobPath,
    durationMs: Number(video.durationMs ?? 0),
  });
  console.log(count > 0 ? `Published ${count} subtitle track(s).` : "No convertible subtitle tracks (or already published).");
} finally {
  await rm(workDir, { recursive: true, force: true });
  await prisma.$disconnect();
}
