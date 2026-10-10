import { expect, test } from 'bun:test';
import { QUALITY_LADDER, selectHdRungs, selectStandardRungs, sizeRungForSource, sourceTierHeight } from './ladder';

const rung = (label: string) => QUALITY_LADDER.find((r) => r.label === label)!;
const labels = (rs: ReadonlyArray<{ label: string }>) => rs.map((r) => r.label);
const NO_CAP = { preset: 'veryfast', singlePass: true, bitrateCapFactor: 0 };
const size = (label: string, w: number, h: number) => {
  const s = sizeRungForSource(rung(label), { width: w, height: h }, NO_CAP);
  return `${s.outWidth}x${s.outHeight}`;
};

test('ordinary 16:9 sources behave exactly as before', () => {
  expect(labels(selectStandardRungs(sourceTierHeight(1920, 1080)))).toEqual(['480p', '720p']);
  expect(labels(selectHdRungs(sourceTierHeight(1920, 1080)))).toEqual(['1080p']);
  expect(labels(selectHdRungs(sourceTierHeight(1280, 720)))).toEqual([]);
  expect(labels(selectStandardRungs(sourceTierHeight(854, 480)))).toEqual(['480p']);
  expect(size('480p', 1920, 1080)).toBe('852x480');
  expect(size('720p', 1920, 1080)).toBe('1280x720');
  expect(size('1080p', 1920, 1080)).toBe('1920x1080');
});

test('a 4K source is capped at 1440p', () => {
  expect(labels(selectHdRungs(sourceTierHeight(3840, 2160)))).toEqual(['1080p', '1440p']);
});

test('a widescreen film ripped at 1920x800 gets 1080p, at its own shape', () => {
  const tier = sourceTierHeight(1920, 800);
  expect(tier).toBe(1080);
  expect(labels(selectHdRungs(tier))).toEqual(['1080p']);
  expect(size('1080p', 1920, 800)).toBe('1920x800'); // not stretched to 1080 high
  expect(size('720p', 1920, 800)).toBe('1280x532');
  expect(size('480p', 1920, 800)).toBe('854x354');
});

test('a slightly cropped 1916x1076 Blu-ray rip counts as 1080p and is never enlarged', () => {
  expect(labels(selectHdRungs(sourceTierHeight(1916, 1076)))).toEqual(['1080p']);
  expect(size('1080p', 1916, 1076)).toBe('1916x1076');
});

test('a real 1000-line source does not get a 1080p rung', () => {
  expect(labels(selectHdRungs(sourceTierHeight(1778, 1000)))).toEqual([]);
});

test('portrait videos are judged by their short side and keep their shape', () => {
  expect(sourceTierHeight(1080, 1920)).toBe(1080);
  expect(labels(selectHdRungs(1080))).toEqual(['1080p']);
  expect(size('720p', 1080, 1920)).toBe('720x1280');
  expect(size('1080p', 1080, 1920)).toBe('1080x1920');
  expect(sourceTierHeight(720, 1280)).toBe(720);
  expect(labels(selectHdRungs(720))).toEqual([]);
});

test('4:3 and square sources', () => {
  expect(sourceTierHeight(1440, 1080)).toBe(1080);
  expect(size('720p', 1440, 1080)).toBe('960x720');
  expect(sourceTierHeight(720, 720)).toBe(720);
});

test('a tiny source gets one 480p rung at its own size (no enlarging)', () => {
  expect(labels(selectStandardRungs(sourceTierHeight(320, 240)))).toEqual(['480p']);
  expect(size('480p', 320, 240)).toBe('320x240');
});

test('the bitrate cap still lowers rungs for low-bitrate sources', () => {
  const s = sizeRungForSource(rung('720p'), { width: 1920, height: 1080, bitrateKbps: 800 }, { preset: 'veryfast', singlePass: true, bitrateCapFactor: 1.5 });
  expect(s.bitrateKbps).toBe(1200);
});
