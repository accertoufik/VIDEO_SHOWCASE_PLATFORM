/**
 * WCAG contrast check for the colour tokens in src/css/colors.ts.   Run:  bun scripts/check-contrast.ts
 * Text needs 4.5:1 (AA), including the muted text used for descriptions and counts.
 */
import { colors } from '../src/css/colors';

type RGBA = [number, number, number, number];

const parse = (input: string): RGBA => {
  const s = input.trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unsupported colour: ${input}`);
  const [r, g, b, a = '1'] = m[1]!.split(',').map((p) => p.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
};
const over = (fg: RGBA, bg: RGBA): RGBA => [
  fg[0] * fg[3] + bg[0] * (1 - fg[3]),
  fg[1] * fg[3] + bg[1] * (1 - fg[3]),
  fg[2] * fg[3] + bg[2] * (1 - fg[3]),
  1,
];
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => ((v / 255) <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const page = parse(colors.background.primary);
const grounds: Record<string, RGBA> = {
  'background.primary': page,
  'background.secondary': parse(colors.background.secondary),
  'background.elevated': parse(colors.background.elevated),
  'surface.base (cards)': parse(colors.surface.base),
  'surface.input (text boxes)': parse(colors.surface.input),
  'surface.soft': parse(colors.surface.soft),
  'surface.glassMedium over page': over(parse(colors.surface.glassMedium), page),
  'surface.glassStrong over page': over(parse(colors.surface.glassStrong), page),
};

const texts: Array<[string, string, number]> = [
  ['text.primary', colors.text.primary, 4.5],
  ['text.secondary', colors.text.secondary, 4.5],
  ['text.muted', colors.text.muted, 4.5],
  ['accent.text (links)', colors.accent.text, 4.5],
  ['status.error', colors.status.error, 4.5],
  ['status.warning', colors.status.warning, 4.5],
  ['status.success', colors.status.success, 4.5],
];

let failures = 0;
const line = (ok: boolean, r: number, min: number, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1 (min ${min})  ${what}`);
};

console.log('\nTEXT ON SURFACES\n');
for (const [name, color, min] of texts)
  for (const [gName, ground] of Object.entries(grounds)) {
    const r = ratio(over(parse(color), ground), ground);
    line(r >= min, r, min, `${name} on ${gName}`);
  }

console.log('\nBUTTONS\n');
{
  const accent = parse(colors.accent.primary);
  line(ratio(parse(colors.text.inverse), accent) >= 4.5, ratio(parse(colors.text.inverse), accent), 4.5, 'text.inverse on accent.primary (primary button)');
  const pressed = parse(colors.accent.pressed);
  line(ratio(parse(colors.text.inverse), pressed) >= 4.5, ratio(parse(colors.text.inverse), pressed), 4.5, 'text.inverse on accent.pressed (pressed button)');
  const soft = parse(colors.surface.soft);
  line(ratio(parse(colors.text.muted), soft) >= 4.5, ratio(parse(colors.text.muted), soft), 4.5, 'text.muted on surface.soft (disabled button label)');
}

console.log(`\n${failures} failing pair(s).`);
process.exit(failures ? 1 : 0);
