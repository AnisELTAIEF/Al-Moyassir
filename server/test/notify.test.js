// Texte des alertes push et regroupement des ayat en passages. Sans base de données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushText } from '../src/notify.js';
import { buildReference, passagesOf } from '../src/reports.js';

test('alertes : sourate, ayat et nombre', () => {
  const [title, body] = pushText('review_ayat', {
    count: 4, organizationName: 'جامع النور',
    refs: [{ surah: 2, from: 5, to: 7, name: 'البقرة' }, { surah: 36, from: 12, to: 12, name: 'يس' }],
  });
  assert.match(title, /\(4\).*Ayat à revoir/);
  assert.equal(body, 'البقرة 5–7 · يس 12 — جامع النور');
  const [t2, b2] = pushText('retake_pages', { pages: [3], pageInfo: [{ page: 3, name: 'البقرة' }], organizationName: 'X' });
  assert.match(t2, /Page à reprendre/);
  assert.equal(b2, '3 (البقرة) — X');
  assert.equal(pushText('retake_pages', { pages: [3, 4], organizationName: 'X' })[1], '3، 4 — X', 'anciennes notifications sans pageInfo');
});

test('passages : ayat consécutifs d’une même sourate regroupés', () => {
  const ref = buildReference(new Map([[1, 7], [2, 10]]), [{ surah: 1, ayah: 1 }], [{ surah: 1, ayah: 1 }]);
  const idx = [[2, 3], [1, 7], [2, 1], [2, 2], [2, 5]].map(([s, a]) => ref.indexOf(s, a));
  assert.deepEqual(passagesOf(ref, idx), [
    { surah: 1, from: 7, to: 7 }, { surah: 2, from: 1, to: 3 }, { surah: 2, from: 5, to: 5 },
  ]);
});
