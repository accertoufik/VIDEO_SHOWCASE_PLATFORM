import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";

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

/**
 * ffprobe is a SEPARATE binary from ffmpeg — same project, different job.
 * ffmpeg encodes/transcodes; ffprobe just inspects a file and reports back
 * facts about it (resolution, duration, codec, bitrate...) without
 * touching the file. We need this to answer "how big was the source
 * video?" BEFORE deciding which quality rungs to generate — ffmpeg alone
 * has no "just tell me the resolution" mode.
 */
ffmpeg.setFfprobePath(ffprobeStatic.path);

export { ffmpeg };