export type Cue = { start: number; end: number; text: string; italic: boolean };

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const toSeconds = (value: string) => {
  const m = TIME.exec(value.trim());
  if (!m) return NaN;
  const [, h, min, sec, ms] = m;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(sec) + Number((ms ?? '0').padEnd(3, '0')) / 1000;
};

/** Removes WebVTT / ASS-style markup and decodes the few entities that appear in cues. */
const cleanText = (raw: string) =>
  raw
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\N/g, '\n')
    .trim();

/** Parses a WebVTT file into cues sorted by start time. Cues that can't be read are skipped. */
export const parseVtt = (source: string): Cue[] => {
  const cues: Cue[] = [];
  const blocks = source.replace(/\r/g, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const timing = lines.findIndex((line) => line.includes('-->'));
    if (timing === -1) continue;
    const [from, to] = (lines[timing] ?? '').split('-->');
    const start = toSeconds(from ?? '');
    const end = toSeconds((to ?? '').trim().split(/\s+/)[0] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const rawText = lines.slice(timing + 1).join('\n');
    const text = cleanText(rawText);
    if (!text) continue;
    // Songs and thoughts are usually whole-cue italics: keep that look.
    const italic = /^\s*<i>[\s\S]*<\/i>\s*$/.test(rawText);
    cues.push({ start, end, text, italic });
  }
  return cues.sort((a, b) => a.start - b.start);
};

/** Every cue showing at `time` (a translation and its romaji line can share the same timing). */
export const cuesAt = (cues: Cue[], time: number): Cue[] =>
  cues.filter((cue) => time >= cue.start && time < cue.end);
