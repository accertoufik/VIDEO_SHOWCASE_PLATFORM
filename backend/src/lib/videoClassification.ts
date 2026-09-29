export const SHORT_MAX_DURATION = 60_000;
export const SHORT_DURATION_TOLERANCE = 500;

// width / height. 9:16 = 0.5625. Real phones also shoot 720x1280 (0.5625) and
// 1080x2340 (0.46), so we accept "9:16 or narrower" rather than exact 9:16.
// 4:5 (0.8), 1:1 (1.0) and every horizontal format are correctly rejected.
export const SHORT_MAX_ASPECT_RATIO = 0.6;

export type VideoFormat = 'LONG_FORM' | 'SHORT_FORM';

/**
 * Phones often store vertical video as 1920x1080 plus a rotation flag (90/270).
 * ffprobe reports the STORED size, so without this a vertical clip would look
 * horizontal. FFmpeg's autorotate applies the flag during encoding, so the
 * DISPLAYED orientation is what classification and sizing must use.
 */

export const getDisplayDimensions = (
  width: number,
  height: number,
  rotationDegrees: number,
) => {
  const normalized = ((Math.round(rotationDegrees) % 360) + 360) % 360;
  const isSideways = normalized === 90 || normalized === 270;
  return isSideways ? { width: height, height: width } : { width, height };
};

/**
 * SHORT_FORM only when BOTH hold: short enough AND portrait 9:16-or-narrower.
 * Unknown/zero values fall back to LONG_FORM — the safe default, since a
 * misfiled Short in the home feed is far less harmful than a long video
 * vanishing into the shorts section.
 */
export const classifyVideoFormat = (input: {
  durationMs: number;
  width: number;
  height: number;
}): VideoFormat => {
  const { durationMs, width, height } = input;

  if (
    !Number.isFinite(durationMs) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    durationMs <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return 'LONG_FORM';
  }

    const isShortEnough = durationMs <= SHORT_MAX_DURATION + SHORT_DURATION_TOLERANCE;
    const isPortrait = width / height <= SHORT_MAX_ASPECT_RATIO;
    return isShortEnough && isPortrait ? 'SHORT_FORM' : 'LONG_FORM';
};
