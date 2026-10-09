import { expect, test } from 'bun:test';
import { collectPurgeTargets } from './purgeTargets';

const VIDEO = '81e43170-784e-43dc-98ee-01ab57ad1a60';
const FOLDER = 'dbc0eca9-519c-42ef-8587-0e02045ccc4b-4fe145b5-73e7-45ab-9bf0-d59a3a736164-mkv';

test('selects the original, the processed folder and the custom thumbnail folder', () => {
  const t = collectPurgeTargets(VIDEO, [
    { container: 'originals', blobPath: 'dbc0eca9-519c-42ef-8587-0e02045ccc4b/4fe145b5-73e7-45ab-9bf0-d59a3a736164.mkv' },
    { container: 'processed', blobPath: `${FOLDER}/master.m3u8` },
    { container: 'processed', blobPath: `${FOLDER}/480p/playlist.m3u8` },
    { container: 'thumbnails', blobPath: `${FOLDER}/thumbnail.jpg` },
  ]);
  expect(t.prefixes).toContainEqual({ container: 'processed', prefix: `${FOLDER}/` });
  expect(t.prefixes).toContainEqual({ container: 'thumbnails', prefix: `thumbnails/${VIDEO}/` });
  expect(t.prefixes.filter((p) => p.container === 'processed')).toHaveLength(1); // one folder, not one per file
  expect(t.blobs).toContainEqual({ container: 'thumbnails', path: `${FOLDER}/thumbnail.jpg` });
  expect(t.blobs.some((b) => b.container === 'originals')).toBe(true);
});

test('never builds a prefix from a short, empty or unsafe path', () => {
  const t = collectPurgeTargets(VIDEO, [
    { container: 'processed', blobPath: 'abc/master.m3u8' },
    { container: 'processed', blobPath: 'master.m3u8' },
    { container: 'processed', blobPath: '../other/x.ts' },
    { container: 'processed', blobPath: '' },
  ]);
  expect(t.prefixes.filter((p) => p.container === 'processed')).toHaveLength(0);
  expect(t.blobs.some((b) => b.path.includes('..'))).toBe(false);
});

test('a video id that is too short selects no thumbnail folder', () => {
  const t = collectPurgeTargets('x', []);
  expect(t.prefixes).toHaveLength(0);
});
