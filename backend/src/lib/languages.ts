/**
 * Language tags inside video files are usually ISO 639-2 ("jpn", "eng"), sometimes 639-1 ("ja"). This turns either
 * into the short code HLS players expect and a readable name for the menus.
 */
const TABLE: Array<{ codes: string[]; code: string; name: string }> = [
  { codes: ['eng', 'en'], code: 'en', name: 'English' },
  { codes: ['jpn', 'ja'], code: 'ja', name: 'Japanese' },
  { codes: ['spa', 'es'], code: 'es', name: 'Spanish' },
  { codes: ['fre', 'fra', 'fr'], code: 'fr', name: 'French' },
  { codes: ['ger', 'deu', 'de'], code: 'de', name: 'German' },
  { codes: ['por', 'pt'], code: 'pt', name: 'Portuguese' },
  { codes: ['ita', 'it'], code: 'it', name: 'Italian' },
  { codes: ['rus', 'ru'], code: 'ru', name: 'Russian' },
  { codes: ['hin', 'hi'], code: 'hi', name: 'Hindi' },
  { codes: ['ben', 'bn'], code: 'bn', name: 'Bengali' },
  { codes: ['ara', 'ar'], code: 'ar', name: 'Arabic' },
  { codes: ['kor', 'ko'], code: 'ko', name: 'Korean' },
  { codes: ['chi', 'zho', 'cmn', 'zh'], code: 'zh', name: 'Chinese' },
  { codes: ['tha', 'th'], code: 'th', name: 'Thai' },
  { codes: ['vie', 'vi'], code: 'vi', name: 'Vietnamese' },
  { codes: ['ind', 'id'], code: 'id', name: 'Indonesian' },
  { codes: ['tur', 'tr'], code: 'tr', name: 'Turkish' },
  { codes: ['pol', 'pl'], code: 'pl', name: 'Polish' },
  { codes: ['nld', 'dut', 'nl'], code: 'nl', name: 'Dutch' },
  { codes: ['swe', 'sv'], code: 'sv', name: 'Swedish' },
  { codes: ['tam', 'ta'], code: 'ta', name: 'Tamil' },
  { codes: ['tel', 'te'], code: 'te', name: 'Telugu' },
  { codes: ['urd', 'ur'], code: 'ur', name: 'Urdu' },
];

const BY_TAG = new Map<string, { code: string; name: string }>();
for (const row of TABLE) for (const tag of row.codes) BY_TAG.set(tag, { code: row.code, name: row.name });

/** null when the tag is missing, "und" (undetermined) or not one we know. */
export const languageInfo = (tag?: string | null): { code: string; name: string } | null => {
  const key = String(tag ?? '').trim().toLowerCase();
  return BY_TAG.get(key) ?? null;
};

/** A safe value for an HLS quoted attribute (no quotes, no line breaks, not too long). */
export const hlsText = (value: string) => value.replace(/["\r\n]/g, "'").trim().slice(0, 60);

/**
 * Names for a list of tracks of one kind, unique inside the list: the language name when known, else the file's own
 * title, else "<fallback> N". Two tracks that would share a name get their title or a number added.
 */
export const uniqueTrackNames = (
  tracks: Array<{ language?: string | null; title?: string | null }>,
  fallback: string,
): string[] => {
  const base = tracks.map((t, i) => {
    const lang = languageInfo(t.language);
    const title = String(t.title ?? '').trim();
    return hlsText(lang?.name ?? (title || `${fallback} ${i + 1}`));
  });
  const seen = new Map<string, number>();
  return base.map((name, i) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (base.filter((n) => n === name).length === 1) return name;
    const title = String(tracks[i]?.title ?? '').trim();
    // Prefer the file's own title to tell duplicates apart, e.g. "English (Signs & Songs)".
    if (title && !name.toLowerCase().includes(title.toLowerCase())) return hlsText(`${name} (${title})`);
    return hlsText(`${name} (${count})`);
  });
};
