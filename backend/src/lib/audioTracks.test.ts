import { expect, test } from 'bun:test';
import { addAudioGroupToMaster, audioMediaLines, pickAudioTracks, type ProbedAudioStream } from './audioTracks';
import { languageInfo, uniqueTrackNames } from './languages';

const a = (index: number, lang: string | undefined, extra: Partial<ProbedAudioStream> = {}): ProbedAudioStream => ({
  index,
  channels: 2,
  tags: lang ? { language: lang } : {},
  ...extra,
});

test('a single audio track makes no extras', () => {
  const r = pickAudioTracks([a(1, 'jpn')]);
  expect(r.primary?.index).toBe(1);
  expect(r.extras).toHaveLength(0);
});

test('no audio at all', () => {
  expect(pickAudioTracks([])).toEqual({ primary: null, extras: [] });
});

test('dual audio: the file\'s default track is primary, not the one with most channels', () => {
  // Typical Blu-ray release: Japanese 2.0 (default) + English 5.1.
  const r = pickAudioTracks([a(1, 'jpn', { disposition: { default: 1 }, channels: 2 }), a(2, 'eng', { channels: 6 })]);
  expect(r.primary).toMatchObject({ index: 1, code: 'ja', name: 'Japanese', isDefault: true });
  expect(r.extras).toHaveLength(1);
  expect(r.extras[0]).toMatchObject({ index: 2, code: 'en', name: 'English', isDefault: false });
});

test('with no default flag the first track is primary; the default flag can sit on a later track', () => {
  expect(pickAudioTracks([a(1, 'jpn'), a(2, 'eng')]).primary?.index).toBe(1);
  expect(pickAudioTracks([a(1, 'jpn'), a(2, 'eng', { disposition: { default: 1 } })]).primary?.index).toBe(2);
});

test('at most 4 tracks are kept', () => {
  const r = pickAudioTracks([1, 2, 3, 4, 5, 6].map((i) => a(i, i % 2 ? 'jpn' : 'eng')));
  expect(1 + r.extras.length).toBe(4);
});

test('unknown language falls back to the title, then to a number', () => {
  expect(uniqueTrackNames([{ language: 'und', title: 'Director commentary' }, { language: null, title: '' }], 'Audio')).toEqual([
    'Director commentary',
    'Audio 2',
  ]);
});

test('two tracks in the same language stay distinguishable', () => {
  const names = uniqueTrackNames(
    [
      { language: 'eng', title: 'Full' },
      { language: 'eng', title: 'Signs & Songs' },
    ],
    'Subtitles',
  );
  expect(new Set(names).size).toBe(2);
  expect(names[1]).toContain('Signs');
});

test('language lookup accepts 3-letter and 2-letter tags and rejects und', () => {
  expect(languageInfo('JPN')?.code).toBe('ja');
  expect(languageInfo('ja')?.name).toBe('Japanese');
  expect(languageInfo('und')).toBeNull();
  expect(languageInfo(undefined)).toBeNull();
});

const MASTER = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=852x480', '480p/playlist.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2900000,RESOLUTION=1280x720', '720p/playlist.m3u8'].join('\n');

test('master gets the audio group and every rung points at it', () => {
  const { primary, extras } = pickAudioTracks([a(1, 'jpn', { disposition: { default: 1 } }), a(2, 'eng')]);
  const out = addAudioGroupToMaster(MASTER, audioMediaLines(primary!, extras));
  const lines = out.split('\n');
  expect(lines[0]).toBe('#EXTM3U');
  expect(lines[1]).toContain('TYPE=AUDIO');
  expect(lines[1]).toContain('DEFAULT=YES');
  expect(lines[1]).not.toContain('URI='); // the default track is inside the rungs
  expect(lines[2]).toContain('URI="audio/a1.m3u8"');
  expect(out.match(/AUDIO="aud"/g)).toHaveLength(2);
  expect(out).toContain('480p/playlist.m3u8');
});

test('applying the audio group twice changes nothing', () => {
  const { primary, extras } = pickAudioTracks([a(1, 'jpn'), a(2, 'eng')]);
  const once = addAudioGroupToMaster(MASTER, audioMediaLines(primary!, extras));
  expect(addAudioGroupToMaster(once, audioMediaLines(primary!, extras))).toBe(once);
});

test('quotes in a track title cannot break the playlist', () => {
  const { primary, extras } = pickAudioTracks([a(1, 'und', { tags: { title: 'Say "hi"' } }), a(2, 'eng')]);
  const lines = audioMediaLines(primary!, extras);
  expect(lines[0]).not.toContain('Say "hi"');
});
