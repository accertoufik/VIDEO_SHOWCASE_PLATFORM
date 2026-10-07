import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { ffmpeg } from '../config/ffmpeg';
import { AzureStorageService } from './azure-storage.service';

/**
 * Subtitles that travel inside an uploaded video file (an .mkv with an English track, say) used to be dropped by
 * the transcode. This pulls the TEXT subtitle streams out as WebVTT and publishes them next to the video's HLS
 * output, then lists them in master.m3u8 as an EXT-X-MEDIA subtitle group, which is the standard way for HLS
 * players (including the app's) to offer a captions menu. Picture-based subtitle formats (DVD / Blu-ray bitmaps)
 * can't be converted to text and are skipped.
 */

const TEXT_CODECS = new Set(['ass', 'ssa', 'subrip', 'srt', 'mov_text', 'webvtt', 'text']);
const MAX_TRACKS = 5;
const GROUP_ID = 'subs';

const LANGUAGES: Record<string, { code: string; name: string }> = {
  eng: { code: 'en', name: 'English' },
  jpn: { code: 'ja', name: 'Japanese' },
  spa: { code: 'es', name: 'Spanish' },
  fre: { code: 'fr', name: 'French' },
  fra: { code: 'fr', name: 'French' },
  ger: { code: 'de', name: 'German' },
  deu: { code: 'de', name: 'German' },
  por: { code: 'pt', name: 'Portuguese' },
  ita: { code: 'it', name: 'Italian' },
  rus: { code: 'ru', name: 'Russian' },
  hin: { code: 'hi', name: 'Hindi' },
  ben: { code: 'bn', name: 'Bengali' },
  ara: { code: 'ar', name: 'Arabic' },
  kor: { code: 'ko', name: 'Korean' },
  chi: { code: 'zh', name: 'Chinese' },
  zho: { code: 'zh', name: 'Chinese' },
};

type Track = { key: string; code: string; name: string };

type ProbedStream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  tags?: Record<string, string | undefined>;
};

const probeSubtitleStreams = (inputPath: string) =>
  new Promise<ProbedStream[]>((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      const streams = (metadata.streams as unknown as ProbedStream[]).filter(
        (s) => s.codec_type === 'subtitle' && TEXT_CODECS.has(String(s.codec_name)),
      );
      resolve(streams);
    });
  });

const extractToVtt = (inputPath: string, streamIndex: number, outPath: string) =>
  new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(['-map', `0:${streamIndex}`, '-f', 'webvtt'])
      .output(outPath)
      .on('end', () => resolve())
      .on('error', (error: Error) => reject(error))
      .run();
  });

/** A one-entry VOD playlist wrapping the whole .vtt file, which is how HLS references an external subtitle file. */
const subtitlePlaylist = (vttName: string, durationSec: number) =>
  [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(durationSec))}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXTINF:${durationSec.toFixed(3)},`,
    vttName,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');

/** Adds the subtitle group to master.m3u8 (and points every rung at it). Safe against concurrent rung writers. */
const addToMaster = async (masterBlobPath: string, tracks: Track[]) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { content, etag } = await AzureStorageService.downloadTextWithEtag('processed', masterBlobPath);
    if (content.includes(`GROUP-ID="${GROUP_ID}"`)) return; // already published (retried job)

    const media = tracks.map(
      (t) =>
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${GROUP_ID}",NAME="${t.name}",LANGUAGE="${t.code}",DEFAULT=NO,AUTOSELECT=NO,FORCED=NO,URI="subs/${t.key}.m3u8"`,
    );
    const lines: string[] = [];
    for (const line of content.split('\n')) {
      if (line.startsWith('#EXTM3U')) {
        lines.push(line, ...media);
      } else if (line.startsWith('#EXT-X-STREAM-INF') && !line.includes('SUBTITLES=')) {
        lines.push(`${line},SUBTITLES="${GROUP_ID}"`);
      } else {
        lines.push(line);
      }
    }
    try {
      await AzureStorageService.uploadTextIfMatch('processed', masterBlobPath, lines.join('\n'), etag);
      return;
    } catch (error: any) {
      if (error?.name === 'ConditionNotMetError' && attempt < 5) continue; // another writer got in first
      throw error;
    }
  }
};

export const SubtitleService = {
  /**
   * Extracts and publishes the subtitle tracks of `inputPath`. Returns how many were published (0 = the file has
   * none, or none that can be converted). Callers should treat a failure as non-fatal: a video without captions
   * is far better than a video that fails to process.
   */
  publish: async (params: {
    inputPath: string;
    workDir: string;
    baseName: string;
    masterBlobPath: string;
    durationMs: number;
  }): Promise<number> => {
    const streams = (await probeSubtitleStreams(params.inputPath)).slice(0, MAX_TRACKS);
    if (streams.length === 0) return 0;

    const durationSec = Math.max(1, params.durationMs / 1000);
    const tracks: Track[] = [];

    for (const [i, stream] of streams.entries()) {
      const lang = LANGUAGES[String(stream.tags?.language ?? '').toLowerCase()];
      const key = `sub${i}`;
      const vttPath = join(params.workDir, `${key}.vtt`);
      try {
        await extractToVtt(params.inputPath, stream.index, vttPath);
        const vtt = await readFile(vttPath, 'utf8');
        if (!vtt.includes('-->')) continue; // converted, but no cues in it

        await AzureStorageService.uploadTextTyped('processed', `${params.baseName}/subs/${key}.vtt`, vtt, 'text/vtt; charset=utf-8');
        await AzureStorageService.uploadTextTyped(
          'processed',
          `${params.baseName}/subs/${key}.m3u8`,
          subtitlePlaylist(`${key}.vtt`, durationSec),
          'application/vnd.apple.mpegurl',
        );
        tracks.push({
          key,
          code: lang?.code ?? String(stream.tags?.language ?? 'und'),
          name: lang?.name ?? `Subtitles ${i + 1}`,
        });
      } catch (error) {
        console.warn(`Subtitle stream ${stream.index} skipped:`, (error as Error).message);
      }
    }

    if (tracks.length === 0) return 0;
    await addToMaster(params.masterBlobPath, tracks);
    return tracks.length;
  },
};
