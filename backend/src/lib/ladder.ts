/**
 * The quality ladder: which renditions a video gets and how big each one is.
 *
 * 1440p is the hard ceiling (a 4K upload is capped there). The ladder is built in two phases: "standard" (480p + 720p)
 * makes a video watchable; "HD" (1080p and/or 1440p) is added afterwards to the same master playlist. A rendition is
 * only made when the source really has that quality: nothing is ever upscaled.
 */
export const QUALITY_LADDER = [
  { label: '480p', width: 854, height: 480, bitrateKbps: 1400 },
  { label: '720p', width: 1280, height: 720, bitrateKbps: 2900 },
  { label: '1080p', width: 1920, height: 1080, bitrateKbps: 6000 },
  { label: '1440p', width: 2560, height: 1440, bitrateKbps: 10000 },
] as const;

export type Rung = (typeof QUALITY_LADDER)[number];

/** A ladder rung fitted to ONE source: the real encoded pixel size and bitrate. */
export type SizedRung = Omit<Rung, 'bitrateKbps'> & {
  /** The bitrate this rung is ENCODED at (the ladder value, or lower when capped to the source's own bitrate). */
  bitrateKbps: number;
  outWidth: number;
  outHeight: number;
};

/**
 * Encoding knobs. Each can be overridden from the environment:
 *   ENCODE_PRESET         libx264 speed preset. Default "veryfast".
 *   ENCODE_SINGLE_PASS    Default on: the 480p + 720p rungs come out of ONE FFmpeg run (the video is decoded once).
 *   BITRATE_CAP_FACTOR    Default 1.5: a rung is never encoded above 1.5x the SOURCE's own bitrate. "0" turns it off.
 */
export type EncodeOptions = { preset: string; singlePass: boolean; bitrateCapFactor: number };
const MIN_CAPPED_KBPS = 400;

export const readEncodeOptions = (): EncodeOptions => {
  const cap = Number(process.env.BITRATE_CAP_FACTOR ?? 1.5);
  return {
    preset: process.env.ENCODE_PRESET || 'veryfast',
    singlePass: process.env.ENCODE_SINGLE_PASS !== 'false',
    bitrateCapFactor: Number.isFinite(cap) && cap > 0 ? cap : 0,
  };
};

/** The ladder bitrate, lowered to `factor x source bitrate` when a cap is on (never below a sane floor). */
export const capBitrate = (ladderKbps: number, sourceKbps: number | undefined, factor: number) => {
  if (!factor || !sourceKbps || sourceKbps <= 0) return ladderKbps;
  return Math.max(MIN_CAPPED_KBPS, Math.min(ladderKbps, Math.round(sourceKbps * factor)));
};

// H.264 needs even dimensions, so round down to the nearest even number.
export const toEven = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

/**
 * A source can be a few pixels short of a named size (a 1916x1076 Blu-ray rip is "1080p" in every practical sense).
 * A rung qualifies when the source is within this much of its height.
 */
const TIER_TOLERANCE = 1.03;

/**
 * The quality class of a source, as a height on the ladder's scale.
 *  - Portrait (a phone video, 1080x1920): its short side, as before.
 *  - Landscape: its height, but never less than what its WIDTH would be at 16:9. A widescreen film ripped at
 *    1920x800 has full 1080p width; judged by height alone (800) it was wrongly left without a 1080p rendition.
 */
export const sourceTierHeight = (width: number, height: number): number => {
  if (height > width) return width;
  return Math.max(height, Math.round((width * 9) / 16));
};

const qualifies = (rung: Rung, tier: number) => rung.height <= Math.round(tier * TIER_TOLERANCE);

/** The 480p/720p half. A source below 480p still gets one 480p rung so the video always has something to play. */
export const selectStandardRungs = (tier: number): Rung[] => {
  const rungs = QUALITY_LADDER.filter((r) => r.label === '480p' || r.label === '720p').filter((r) => qualifies(r, tier));
  return rungs.length === 0 ? [QUALITY_LADDER[0]] : rungs;
};

/** The HD half: 1080p and/or 1440p. A source below 1080p gets none (its standard rungs already are its quality). */
export const selectHdRungs = (tier: number): Rung[] =>
  QUALITY_LADDER.filter((r) => r.label === '1080p' || r.label === '1440p').filter((r) => qualifies(r, tier));

/**
 * The real pixel size of a rung for this source, keeping the picture's shape and never enlarging it:
 *  - Portrait: the rung's number is the WIDTH (a 1080x1920 Short is a "1080p" video).
 *  - Landscape: the picture is fitted inside the rung's box (e.g. 1920x1080), so a 2.4:1 film at 1080p stays
 *    1920x800 instead of being stretched to 1080 high.
 */
export const sizeRungForSource = (
  rung: Rung,
  source: { width: number; height: number; bitrateKbps?: number },
  options: EncodeOptions = readEncodeOptions(),
): SizedRung => {
  const bitrateKbps = capBitrate(rung.bitrateKbps, source.bitrateKbps, options.bitrateCapFactor);
  if (source.height > source.width) {
    const outWidth = toEven(Math.min(rung.height, source.width));
    return { ...rung, bitrateKbps, outWidth, outHeight: toEven((outWidth * source.height) / source.width) };
  }
  const scale = Math.min(rung.width / source.width, rung.height / source.height, 1);
  return { ...rung, bitrateKbps, outWidth: toEven(source.width * scale), outHeight: toEven(source.height * scale) };
};
