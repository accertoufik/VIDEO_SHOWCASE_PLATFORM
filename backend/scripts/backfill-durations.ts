/**
 * One-off: videos processed before durations were stored have durationMs = NULL, so cards show no length.
 * The length is read from the video's own HLS playlist (sum of #EXTINF), so nothing is downloaded or re-encoded.
 *
 *   bun run scripts/backfill-durations.ts          # dry run: prints what it would do
 *   bun run scripts/backfill-durations.ts --apply  # writes durationMs
 */
import { prisma } from "../src/config/db";
import { AzureStorageService } from "../src/services/azure-storage.service";

const apply = process.argv.includes("--apply");

const readText = async (blobPath: string) => {
  const url = await AzureStorageService.generateReadSasUrl("processed", blobPath, 5);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${blobPath}`);
  return res.text();
};

const durationFromHls = async (manifestPath: string) => {
  const base = manifestPath.replace(/\/[^/]+$/, "");
  const master = await readText(manifestPath);
  const rung = master.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#") && l.endsWith(".m3u8"));
  if (!rung) throw new Error("no rung playlist in master");
  const playlist = await readText(`${base}/${rung}`);
  const seconds = [...playlist.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  if (!(seconds > 0)) throw new Error("no #EXTINF entries");
  return Math.round(seconds * 1000);
};

const videos = await prisma.video.findMany({
  where: { durationMs: null, deletedAt: null, hlsManifestAssetId: { not: null } },
  include: { hlsManifestAsset: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${videos.length} videos without a duration${apply ? "" : " (dry run)"}`);

let fixed = 0;
for (const v of videos) {
  try {
    if (!v.hlsManifestAsset) continue;
    const ms = await durationFromHls(v.hlsManifestAsset.blobPath);
    console.log(`${v.id.slice(0, 8)}  ${(ms / 1000).toFixed(1)}s  ${v.title.slice(0, 40)}`);
    if (apply) {
      await prisma.video.update({ where: { id: v.id }, data: { durationMs: BigInt(ms) } });
      fixed++;
    }
  } catch (error) {
    console.log(`${v.id.slice(0, 8)}  skipped: ${(error as Error).message}`);
  }
}
console.log(apply ? `updated ${fixed}` : "nothing written. Re-run with --apply.");
await prisma.$disconnect();
