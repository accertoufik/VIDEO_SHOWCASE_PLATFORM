/**
 * Encoding benchmark: runs the worker's own encode code with different settings on a SAMPLE file and reports
 * time, output size and picture quality (SSIM / PSNR against the original) for each rung.
 *
 *   bun run scripts/benchmark-encode.ts <video file> [seconds=60] [--hd]
 *
 * Reads and writes only local temp files: no database, no Azure.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import { EncodingForBenchmark as E, type EncodeOptions } from '../src/services/media-processing.service';

const run = promisify(execFile);
const file = process.argv[2];
const seconds = Number(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 60);
const withHd = process.argv.includes('--hd');
if (!file) throw new Error('usage: bun run scripts/benchmark-encode.ts <video file> [seconds] [--hd]');

const CONFIGS: Array<{ name: string; options: EncodeOptions }> = [
  { name: 'A  current (medium, separate runs, no cap)', options: { preset: 'medium', singlePass: false, bitrateCapFactor: 0 } },
  { name: 'B  single pass (medium)', options: { preset: 'medium', singlePass: true, bitrateCapFactor: 0 } },
  { name: 'C  single pass + veryfast', options: { preset: 'veryfast', singlePass: true, bitrateCapFactor: 0 } },
  { name: 'D  single pass + veryfast + bitrate cap x1.5', options: { preset: 'veryfast', singlePass: true, bitrateCapFactor: 1.5 } },
];

/**
 * Mean SSIM and PSNR of an encoded rung against the original scaled to the same size.
 * Measured with the system `ffmpeg`: the static build bundled for the worker crashes (SIGSEGV) on this step.
 * The ENCODING being measured still runs on the bundled build, exactly as in production.
 */
const quality = async (playlist: string, original: string, w: number, h: number) => {
  const measure = async (metric: 'ssim' | 'psnr') => {
    const { stderr } = await run(
      'ffmpeg',
      ['-hide_banner', '-i', playlist, '-i', original, '-lavfi', `[1:v]scale=${w}:${h}:flags=bicubic[ref];[0:v][ref]${metric}`, '-f', 'null', '-'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stderr;
  };
  const ssim = /All:([0-9.]+)/.exec(await measure('ssim'))?.[1];
  const psnr = /average:([0-9.]+|inf)/.exec(await measure('psnr'))?.[1];
  return { ssim: ssim ? Number(ssim) : NaN, psnr: psnr ? Number(psnr) : NaN };
};

const folderBytes = async (dir: string, label: string) => {
  let total = 0;
  for (const f of await readdir(dir)) if (f.startsWith(label) && f.endsWith('.ts')) total += (await stat(join(dir, f))).size;
  return total;
};

const work = await mkdtemp(join(tmpdir(), 'encode-bench-'));
try {
  // A short excerpt keeps the benchmark quick; it is the same material for every configuration.
  const sample = join(work, 'sample.mp4');
  await run(ffmpegPath as string, ['-hide_banner', '-y', '-i', file, '-t', String(seconds), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', sample]);

  // The excerpt's own bitrate is not representative (a cut can land on a busy scene); the cap should follow the
  // bitrate of the WHOLE original file, as it does in the worker.
  const whole = await E.probeSourceMetadata(file);
  const source = { ...(await E.probeSourceMetadata(sample)), bitrateKbps: whole.bitrateKbps };
  const short = Math.min(source.width, source.height);
  const ladder = [...E.selectStandardRungs(short), ...(withHd ? E.selectHdRungs(short) : [])];
  console.log(`\nSample: ${seconds}s of "${file.split('/').pop()}" — ${source.width}x${source.height}, source bitrate ~${source.bitrateKbps ?? '?'} kbps`);
  console.log(`Rungs: ${ladder.map((r) => r.label).join(', ')}   (CPU threads: ${(await import('node:os')).cpus().length})\n`);

  const results: string[] = [];
  for (const { name, options } of CONFIGS) {
    const dir = await mkdtemp(join(work, 'run-'));
    const rungs = ladder.map((r) => E.sizeRungForSource(r, source, options));
    const started = Date.now();
    if (options.singlePass && rungs.length > 1) await E.runFfmpegEncodeTogether(sample, dir, rungs, options.preset);
    else await Promise.all(rungs.map((r) => E.runFfmpegEncode(sample, join(dir, `${r.label}.m3u8`), r, options.preset)));
    const took = (Date.now() - started) / 1000;

    console.log(`${name}\n  encode time: ${took.toFixed(1)}s  (${(seconds / took).toFixed(2)}x realtime)`);
    let total = 0;
    for (const r of rungs) {
      const bytes = await folderBytes(dir, r.label);
      total += bytes;
      const q = await quality(join(dir, `${r.label}.m3u8`), sample, r.outWidth, r.outHeight);
      console.log(`  ${r.label.padEnd(6)} ${String(r.bitrateKbps).padStart(5)} kbps  ${(bytes / 1e6).toFixed(1).padStart(7)} MB   SSIM ${q.ssim.toFixed(4)}   PSNR ${q.psnr.toFixed(2)} dB`);
    }
    console.log(`  total output: ${(total / 1e6).toFixed(1)} MB\n`);
    results.push(`${name.padEnd(48)} ${took.toFixed(1).padStart(6)}s  ${(total / 1e6).toFixed(1).padStart(7)} MB`);
    await rm(dir, { recursive: true, force: true });
  }
  console.log('SUMMARY\n' + results.join('\n'));
} finally {
  await rm(work, { recursive: true, force: true });
}
