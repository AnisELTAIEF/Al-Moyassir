// Calculs global / successif (D1) et données de référence du mushaf. Nécessite la base de test (TEST_DB_*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import mysql from 'mysql2/promise';
import { loadReference, flagsFrom, memorizationStats, retakePages, pageStatus, acquiredFlags } from '../src/reports.js';

const cfg = loadConfig({
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_USER: process.env.TEST_DB_USER ?? 'fifidh',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'fifidh',
  DB_NAME: process.env.TEST_DB_NAME ?? 'fifidh_test',
  JWT_SECRET: 'x'.repeat(40),
  BOOTSTRAP_ADMIN_EMAIL: 'anis.eltaief@gmail.com',
});
let pool, ref;
const DATA = new URL('../../mobile/assets/data/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));

before(async () => {
  const root = await mysql.createConnection({ ...cfg.db });
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await root.query('SHOW TABLES');
  for (const t of tables) await root.query(`DROP TABLE \`${Object.values(t)[0]}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 1');
  await root.end();
  await migrate(cfg.db, () => {});
  pool = createPool(cfg.db);
  ref = await loadReference(pool);
});
after(async () => { await pool.end(); });

const ayatOf = (range) => Array.from({ length: range.to - range.from }, (_, i) => range.from + i);
const flagsOf = (...ranges) => {
  const f = new Uint8Array(ref.total);
  for (const r of ranges) for (const i of ayatOf(r)) f[i] = 1;
  return f;
};

test('repères : 6214 ayat, 114 sourates, 60 ahzab et 604 pages qui se suivent sans trou', () => {
  assert.equal(ref.total, 6214);
  for (const [name, list, n] of [['sourates', ref.surahRanges, 114], ['ahzab', ref.hizbRanges, 60], ['pages', ref.pageRanges, 604]]) {
    assert.equal(list.length, n, name);
    assert.equal(list[0].from, 0, `${name} : début`);
    assert.equal(list.at(-1).to, 6214, `${name} : fin`);
    for (let i = 1; i < list.length; i++) assert.equal(list[i].from, list[i - 1].to, `${name} ${i}`);
    for (const r of list) assert.ok(r.to > r.from, `${name} vide`);
  }
});

test('anti-dérive : pages et ahzab du serveur = ceux de l’application (recalculés ici indépendamment)', async () => {
  const pages = json('mushaf_pages.json').pages;
  const [dbPages] = await pool.query('SELECT page, surah, ayah FROM mushaf_pages ORDER BY page');
  assert.deepEqual(dbPages.map((r) => [r.surah, r.ayah]), pages);

  const counts = new Map(json('quran_qalun.json').surahs.map((s) => [s.n, s.ayahs.length]));
  const thumun = json('divisions.json').thumun;
  const expected = [];
  for (let h = 1; h <= 60; h++) {
    const [s, a, word] = thumun[(h - 1) * 8];
    // Hizb commençant en milieu d'ayah : le premier ayah entier est le suivant (règle de l'app).
    expected.push(word > 1 ? (a < counts.get(s) ? [s, a + 1] : [s + 1, 1]) : [s, a]);
  }
  const [dbHizb] = await pool.query('SELECT surah, ayah FROM hizb_starts ORDER BY hizb');
  assert.deepEqual(dbHizb.map((r) => [r.surah, r.ayah]), expected);
});

test('rien d’acquis : tout à zéro', () => {
  const s = memorizationStats(ref, new Uint8Array(ref.total));
  assert.deepEqual(s, { ayat: 0, surahs: { complete: 0, longestRun: 0 }, ahzab: { complete: 0, longestRun: 0 } });
});

test('tout acquis : 114 sourates, 60 ahzab, successif = global', () => {
  const s = memorizationStats(ref, new Uint8Array(ref.total).fill(1));
  assert.equal(s.ayat, 6214);
  assert.deepEqual(s.surahs, { complete: 114, longestRun: 114 });
  assert.deepEqual(s.ahzab, { complete: 60, longestRun: 60 });
});

test('sourate ou hizb PARTIEL : ne compte pas', () => {
  const f = flagsOf({ from: 0, to: 6 }); // Al-Fatiha sauf son dernier ayah (7)
  const s = memorizationStats(ref, f);
  assert.equal(s.ayat, 6);
  assert.equal(s.surahs.complete, 0);
  assert.equal(s.ahzab.complete, 0);
});

test('Al-Fatiha entière : 1 sourate ; le premier hizb entier : 1 hizb', () => {
  assert.deepEqual(memorizationStats(ref, flagsOf(ref.surahRanges[0])).surahs, { complete: 1, longestRun: 1 });
  const s = memorizationStats(ref, flagsOf(ref.hizbRanges[0]));
  assert.deepEqual(s.ahzab, { complete: 1, longestRun: 1 });
  assert.equal(s.surahs.complete, 1, 'le hizb 1 contient Al-Fatiha entière');
});

test('suite interrompue : ahzab 1, 2 et 4 → global 3, successif 2', () => {
  const s = memorizationStats(ref, flagsOf(ref.hizbRanges[0], ref.hizbRanges[1], ref.hizbRanges[3]));
  assert.deepEqual(s.ahzab, { complete: 3, longestRun: 2 });
});

test('sourates courtes de la fin : An-Nas à Al-Ikhlas (112-114) = suite de 3', () => {
  const s = memorizationStats(ref, flagsOf(ref.surahRanges[111], ref.surahRanges[112], ref.surahRanges[113]));
  assert.deepEqual(s.surahs, { complete: 3, longestRun: 3 });
});

test('propriété : le successif n’excède jamais le global (1000 tirages aléatoires)', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 1000; t++) {
    // Mélange de blocs d'unités entières et de bruit, pour atteindre des cas intéressants.
    const f = new Uint8Array(ref.total);
    const p = rnd();
    for (const r of ref.hizbRanges) if (rnd() < p) f.fill(1, r.from, r.to);
    for (const r of ref.surahRanges) if (rnd() < p / 4) f.fill(1, r.from, r.to);
    for (let k = 0; k < 20; k++) f[Math.floor(rnd() * ref.total)] = 0;
    const s = memorizationStats(ref, f);
    assert.ok(s.surahs.longestRun <= s.surahs.complete, 'sourates');
    assert.ok(s.ahzab.longestRun <= s.ahzab.complete, 'ahzab');
    assert.ok(s.surahs.complete <= 114 && s.ahzab.complete <= 60);
  }
});

test('flagsFrom : couples [sourate, ayah] ; ayah inexistant refusé', () => {
  const f = flagsFrom(ref, [[1, 1], [1, 7], [114, 6]]);
  assert.equal(f.reduce((a, b) => a + b, 0), 3);
  assert.equal(f[ref.total - 1], 1, 'dernier ayah du Coran');
  assert.throws(() => flagsFrom(ref, [[1, 8]]), RangeError);
  assert.throws(() => flagsFrom(ref, [[115, 1]]), RangeError);
  assert.throws(() => flagsFrom(ref, [[2, 0]]), RangeError);
});

// ───────────── Validation par l'enseignant ─────────────
// Page 3 du mushaf de Qalun = 2:5 → 2:15 (11 ayat) ; page 4 commence en 2:16.
const page = (n) => ref.pageRanges[n - 1];
const codes = () => new Uint8Array(ref.total);
const put = (c, p, n, code) => { for (let i = 0; i < n; i++) c[page(p).from + i] = code; };

test('refAt est l’inverse exact de indexOf pour les 6214 ayat', () => {
  for (let i = 0; i < ref.total; i++) {
    const [s, a] = ref.refAt(i);
    assert.equal(ref.indexOf(s, a), i);
  }
  assert.deepEqual(ref.refAt(0), [1, 1]);
  assert.deepEqual(ref.refAt(ref.total - 1), [114, 6]);
  assert.throws(() => ref.refAt(-1), RangeError);
  assert.throws(() => ref.refAt(ref.total), RangeError);
});

test('page à reprendre : à partir du seuil d’ayat « avec erreur » sur la MÊME page', () => {
  assert.equal(page(3).to - page(3).from, 11, 'page 3 = 11 ayat (donnée de référence)');
  const c = codes();
  put(c, 3, 2, 2);
  assert.deepEqual(retakePages(ref, c, 3), [], '2 erreurs < seuil 3');
  assert.deepEqual(retakePages(ref, c, 2), [3], 'seuil réglé à 2 (D4) : à reprendre');
  c[page(3).from + 2] = 2;
  assert.deepEqual(retakePages(ref, c, 3), [3], '3 erreurs = seuil');
});

test('les erreurs ne se cumulent pas d’une page à l’autre', () => {
  const c = codes();
  put(c, 3, 2, 2);
  put(c, 4, 2, 2);
  assert.deepEqual(retakePages(ref, c, 3), [], '2 + 2 erreurs sur deux pages différentes');
});

test('seul un « acquis avec erreur » compte comme erreur (pas « à revoir »)', () => {
  const c = codes();
  put(c, 3, 5, 3); // 5 ayat « à revoir »
  assert.deepEqual(retakePages(ref, c, 3), []);
});

test('ayat comptés : acquis et acquis avec erreur ; rien sur une page à reprendre ni pour « à revoir »', () => {
  const c = codes();
  put(c, 3, 11, 1);
  assert.equal(acquiredFlags(ref, c, 3).reduce((a, b) => a + b, 0), 11, 'page entièrement acquise');
  c[page(3).from] = 2; c[page(3).from + 1] = 2; // 2 erreurs : toujours acquise
  assert.equal(acquiredFlags(ref, c, 3).reduce((a, b) => a + b, 0), 11, '2 erreurs < seuil : compte');
  c[page(3).from + 2] = 2; // 3e erreur : page à reprendre
  assert.equal(acquiredFlags(ref, c, 3).reduce((a, b) => a + b, 0), 0, 'page à reprendre : aucun ayat compté');
  const r = codes(); put(r, 3, 11, 3);
  assert.equal(acquiredFlags(ref, r, 3).reduce((a, b) => a + b, 0), 0, '« à revoir » ne compte pas');
});

test('statut de page : none → partial → complete → retake', () => {
  const c = codes();
  assert.equal(pageStatus(ref, c, 3, 3), 'none');
  put(c, 3, 4, 1);
  assert.equal(pageStatus(ref, c, 3, 3), 'partial');
  put(c, 3, 11, 1);
  assert.equal(pageStatus(ref, c, 3, 3), 'complete');
  c[page(3).from] = 3;
  assert.equal(pageStatus(ref, c, 3, 3), 'partial', 'un ayah à revoir : la page n’est plus complète');
  put(c, 3, 3, 2);
  assert.equal(pageStatus(ref, c, 3, 3), 'retake');
});

test('une page à reprendre fait perdre un hizb entier acquis (successif comme global)', () => {
  const c = codes();
  const h = ref.hizbRanges[0];
  for (let i = h.from; i < h.to; i++) c[i] = 1;
  assert.equal(memorizationStats(ref, acquiredFlags(ref, c, 3)).ahzab.complete, 1);
  put(c, 3, 3, 2); // 3 erreurs sur la page 3, qui est dans le hizb 1
  const s = memorizationStats(ref, acquiredFlags(ref, c, 3));
  assert.deepEqual(s.ahzab, { complete: 0, longestRun: 0 });
});
