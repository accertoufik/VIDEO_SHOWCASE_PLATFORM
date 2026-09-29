/**
 * ffprobe-static has no official @types package (unlike ffmpeg-static,
 * which ships its own typings via @types/fluent-ffmpeg's peer setup).
 * This is a minimal ambient declaration just for the one field we use —
 * the absolute path to the bundled ffprobe binary for this platform.
 */
declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string };
  export default ffprobeStatic;
}