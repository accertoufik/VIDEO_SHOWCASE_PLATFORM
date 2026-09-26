import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

/**
 * ffmpeg-static bundles a real FFmpeg executable for your OS/CPU and just
 * gives us its file path on disk (e.g. /node_modules/ffmpeg-static/ffmpeg).
 * fluent-ffmpeg doesn't know where that is by default, so we tell it once,
 * here, at import time — every other file just imports { ffmpeg } from
 * this file and it's already pointed at the right binary.
 */

if(!ffmpegPath) {
  throw new Error("ffmpeg-static failed to load a binary for your OS/CPU");
}

ffmpeg.setFfmpegPath(ffmpegPath);

export { ffmpeg };