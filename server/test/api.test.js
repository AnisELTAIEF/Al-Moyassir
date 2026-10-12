// Tests d'intégration : nécessitent une base MariaDB vide (variables TEST_DB_*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const env = {
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_USER: process.env.TEST_DB_USER ?? 'fifidh',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'fifidh',
  DB_NAME: process.env.TEST_DB_NAME ?? 'fifidh_test',
  JWT_SECRET: 'x'.repeat(40),
  BOOTSTRAP_ADMIN_EMAIL: 'anis.eltaief@gmail.com',
  GOOGLE_CLIENT_IDS: 'test-client',
  PUBLIC_URL: 'https://quran.example.com',
};
const cfg = loadConfig(env);
let app, pool;

// Faux vérificateur Google : le « jeton » est « google:<sub>:<email>:<nom> ».
const fakeGoogle = async (t) => {
  const [kind, sub, email, name] = t.split(':');
  if (kind !== 'google') throw new Error('bad');
  return { sub, email, name };
};

before(async () => {
  const root = await mysql.createConnection({ ...cfg.db });
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await root.query('SHOW TABLES');
  for (const t of tables) await root.query(`DROP TABLE \`${Object.values(t)[0]}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 1');
  await root.end();
  await migrate(cfg.db, () => {});
  pool = createPool(cfg.db);
  app = await buildApp(cfg, { pool, verifyGoogle: fakeGoogle, logger: false });
});
after(async () => { await app.close(); await pool.end(); });

const call = async (method, url, { token, body } = {}) => {
  const res = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json ? safeJson(res.body) : res.body };
};
const safeJson = (b) => { try { return JSON.parse(b); } catch { return b; } };
const google = (sub, email, name, invitationCode) => call('POST', '/auth/google',
  { body: { idToken: `google:${sub}:${email}:${name}xxxxxxxxxxxxxxxx`, ...(invitationCode ? { invitationCode } : {}) } });

const S = {};

test('migrations idempotentes + 114 sourates / 6214 ayat', async () => {
  await migrate(cfg.db, () => {});
  const [[r]] = await pool.query('SELECT COUNT(*) c, SUM(ayah_count) s FROM surahs');
  assert.equal(Number(r.c), 114);
  assert.equal(Number(r.s), 6214);
});

test('un inconnu ne peut pas entrer sans invitation (Google et mot de passe)', async () => {
  const g = await google('s-x', 'inconnu@x.io', 'Inconnu');
  assert.equal(g.status, 403);
  assert.equal(g.body.error, 'invitation_required');
  const r = await call('POST', '/auth/register', { body: { email: 'inconnu@x.io', password: 'motdepasse1', displayName: 'Inc' } });
  assert.equal(r.status, 403);
});

test('anis.eltaief@gmail.com devient admin par défaut via Google', async () => {
  const r = await google('s-anis', 'Anis.Eltaief@gmail.com', 'Anis');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.role, 'admin');
  assert.ok(r.body.accessToken && r.body.refreshToken);
  S.admin = r.body;
  const again = await google('s-anis', 'anis.eltaief@gmail.com', 'Anis');
  assert.equal(again.body.user.id, S.admin.user.id, 'même compte au 2e passage');
});

test('admin : crée un groupe et deux invitations', async () => {
  const g = await call('POST', '/admin/groups', { token: S.admin.accessToken, body: { name: 'Halaqa du vendredi' } });
  assert.equal(g.status, 200);
  S.groupId = g.body.id;
  const i1 = await call('POST', '/admin/invitations', { token: S.admin.accessToken, body: { email: 'Bob@X.io', groupId: S.groupId } });
  assert.equal(i1.status, 200, JSON.stringify(i1.body));
  assert.match(i1.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(i1.body.link, `https://quran.example.com/invite/${i1.body.code}`);
  S.bobCode = i1.body.code;
  const i2 = await call('POST', '/admin/invitations', { token: S.admin.accessToken, body: { email: 'carol@x.io', role: 'user' } });
  S.carolCode = i2.body.code;
  const list = await call('GET', '/admin/invitations', { token: S.admin.accessToken });
  assert.equal(list.body.items.filter((x) => x.state === 'pending').length, 2);
  const preview = await call('GET', `/auth/invitations/${S.bobCode.toLowerCase().replace('-', '')}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.groupName, 'Halaqa du vendredi');
});

test('invité par e-mail : Google avec la même adresse suffit, et rejoint le groupe', async () => {
  const r = await google('s-bob', 'bob@x.io', 'Bob');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.role, 'user');
  S.bob = r.body;
  const groups = await call('GET', '/me/groups', { token: S.bob.accessToken });
  assert.equal(groups.body.items[0].name, 'Halaqa du vendredi');
  const reuse = await call('POST', '/auth/register', { body: { email: 'z@x.io', password: 'motdepasse1', displayName: 'Z', invitationCode: S.bobCode } });
  assert.equal(reuse.status, 400, 'un code déjà utilisé est refusé');
});

test('invité par code : inscription mot de passe puis connexion', async () => {
  const r = await call('POST', '/auth/register', { body: { email: 'carol@x.io', password: 'motdepasse1', displayName: 'Carol', invitationCode: S.carolCode } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  S.carol = r.body;
  const bad = await call('POST', '/auth/login', { body: { email: 'carol@x.io', password: 'mauvais!!' } });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/auth/login', { body: { email: 'CAROL@x.io', password: 'motdepasse1' } });
  assert.equal(ok.status, 200);
});

test('progression : envoi, dernière écriture gagnante, sourate entière, suppression', async () => {
  const t = S.bob.accessToken;
  let r = await call('PUT', '/me/progress', { token: t, body: { items: [
    { surah: 1, ayah: 1, status: 'memorized', updatedAt: '2026-10-01T10:00:00.000Z' },
    { surah: 1, ayah: 2, status: 'learning', updatedAt: '2026-10-01T10:00:00.000Z' },
  ] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // une écriture plus ancienne ne remplace pas
  await call('PUT', '/me/progress', { token: t, body: { items: [{ surah: 1, ayah: 1, status: 'learning', updatedAt: '2026-09-01T10:00:00.000Z' }] } });
  r = await call('GET', '/me/progress', { token: t });
  assert.equal(r.body.items.find((x) => x.ayah === 1).status, 'memorized');
  // ayah inexistant
  r = await call('PUT', '/me/progress', { token: t, body: { items: [{ surah: 1, ayah: 8, status: 'memorized' }] } });
  assert.equal(r.status, 400);
  // sourate entière : Al-Baqara = 285 ayat en Qalun
  r = await call('PUT', '/me/progress/surah/2', { token: t, body: { status: 'memorized' } });
  assert.equal(r.body.ayahs, 285);
  r = await call('GET', '/me/progress', { token: t });
  assert.equal(r.body.items.filter((x) => x.surah === 2 && x.status === 'memorized').length, 285);
  r = await call('PUT', '/me/progress/surah/2', { token: t, body: { status: null } });
  r = await call('POST', '/me/progress/delete', { token: t, body: { keys: [{ surah: 1, ayah: 2 }] } });
  r = await call('GET', '/me/progress', { token: t });
  assert.deepEqual(r.body.items.map((x) => `${x.surah}:${x.ayah}`), ['1:1']);
});

test('progression : marquage « à revoir » (needsReview), rétrocompatible', async () => {
  const t = S.bob.accessToken;
  const get = async () => (await call('GET', '/me/progress', { token: t })).body.items.find((x) => x.surah === 1 && x.ayah === 1);
  assert.equal((await get()).needsReview, false, 'valeur par défaut');
  let r = await call('PUT', '/me/progress', { token: t, body: { items: [
    { surah: 1, ayah: 1, status: 'memorized', needsReview: true, updatedAt: '2026-10-02T10:00:00.000Z' },
  ] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await get()).needsReview, true);
  // ancien client (sans le champ), écriture plus récente : le statut change, le marquage reste
  await call('PUT', '/me/progress', { token: t, body: { items: [{ surah: 1, ayah: 1, status: 'memorized', reviewCount: 1, updatedAt: '2026-10-03T10:00:00.000Z' }] } });
  let it = await get();
  assert.equal(it.needsReview, true);
  assert.equal(it.reviewCount, 1);
  // écriture plus ancienne avec le champ : ignorée
  await call('PUT', '/me/progress', { token: t, body: { items: [{ surah: 1, ayah: 1, status: 'memorized', needsReview: false, updatedAt: '2026-09-01T10:00:00.000Z' }] } });
  assert.equal((await get()).needsReview, true);
  // écriture plus récente : levée du marquage
  await call('PUT', '/me/progress', { token: t, body: { items: [{ surah: 1, ayah: 1, status: 'memorized', needsReview: false, updatedAt: '2026-10-04T10:00:00.000Z' }] } });
  it = await get();
  assert.equal(it.needsReview, false);
  assert.equal(it.status, 'memorized');
});

test('droits : un utilisateur n’accède ni à /admin ni au suivi du groupe', async () => {
  assert.equal((await call('GET', '/admin/users', { token: S.bob.accessToken })).status, 403);
  assert.equal((await call('GET', `/groups/${S.groupId}/overview`, { token: S.bob.accessToken })).status, 403);
  assert.equal((await call('GET', '/me/progress')).status, 401);
});

test('admin de groupe : voit son groupe, pas l’administration', async () => {
  const carolId = S.carol.user.id;
  await call('PUT', `/admin/groups/${S.groupId}/members/${carolId}`, { token: S.admin.accessToken, body: { role: 'admin' } });
  const ov = await call('GET', `/groups/${S.groupId}/overview`, { token: S.carol.accessToken });
  assert.equal(ov.status, 200, JSON.stringify(ov.body));
  const bob = ov.body.members.find((m) => m.email === 'bob@x.io');
  assert.equal(bob.memorized, 1);
  const p = await call('GET', `/groups/${S.groupId}/members/${S.bob.user.id}/progress`, { token: S.carol.accessToken });
  assert.equal(p.body.items.length, 1);
  assert.equal((await call('GET', '/admin/users', { token: S.carol.accessToken })).status, 403);
});

test('admin de groupe : gère les membres de SON groupe par e-mail', async () => {
  const t = S.carol.accessToken; // Carol est admin du groupe « Halaqa »
  // compte existant → ajouté directement
  const add = await call('POST', `/groups/${S.groupId}/members`, { token: t, body: { email: 'anis.eltaief@gmail.com' } });
  assert.equal(add.status, 200, JSON.stringify(add.body));
  assert.equal(add.body.added, true);
  // nouvelle personne → invitation dans ce groupe, comme admin du groupe
  const inv = await call('POST', `/groups/${S.groupId}/members`, { token: t, body: { email: 'dina@x.io', role: 'admin' } });
  assert.equal(inv.body.invited, true);
  assert.match(inv.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.match(inv.body.message, /Halaqa du vendredi/);
  const pending = await call('GET', `/groups/${S.groupId}/invitations`, { token: t });
  assert.equal(pending.body.items.length, 1);
  const dina = await call('POST', '/auth/register', { body: { email: 'dina@x.io', password: 'motdepasse1', displayName: 'Dina', invitationCode: inv.body.code } });
  assert.equal(dina.status, 200);
  S.dina = dina.body;
  const groups = await call('GET', '/me/groups', { token: S.dina.accessToken });
  assert.equal(groups.body.items[0].role, 'admin', 'Dina entre directement comme admin du groupe');
  // renommer le groupe
  const ren = await call('PATCH', `/groups/${S.groupId}`, { token: t, body: { name: 'Halaqa du vendredi soir' } });
  assert.equal(ren.status, 200);
});

test('admin de groupe : aucun droit sur un autre groupe ni sur l’administration', async () => {
  const other = await call('POST', '/admin/groups', { token: S.admin.accessToken, body: { name: 'Autre groupe' } });
  S.otherGroup = other.body.id;
  const t = S.carol.accessToken;
  assert.equal((await call('GET', `/groups/${S.otherGroup}/overview`, { token: t })).status, 403);
  assert.equal((await call('POST', `/groups/${S.otherGroup}/members`, { token: t, body: { email: 'x@x.io' } })).status, 403);
  assert.equal((await call('POST', '/admin/invitations', { token: t, body: { email: 'y@x.io' } })).status, 403);
  // un membre simple ne gère pas le groupe
  assert.equal((await call('POST', `/groups/${S.groupId}/members`, { token: S.bob.accessToken, body: { email: 'z@x.io' } })).status, 403);
});

test('admin de groupe : le groupe garde au moins un admin ; un membre peut partir', async () => {
  const t = S.dina.accessToken;
  // Carol se retire du rôle admin : Dina reste admin → OK
  let r = await call('PUT', `/groups/${S.groupId}/members/${S.carol.user.id}`, { token: t, body: { role: 'member' } });
  assert.equal(r.status, 200);
  // Dina, dernière admin du groupe, ne peut pas se rétrograder ni partir
  r = await call('PUT', `/groups/${S.groupId}/members/${S.dina.user.id}`, { token: t, body: { role: 'member' } });
  assert.equal(r.status, 409);
  r = await call('DELETE', `/groups/${S.groupId}/members/${S.dina.user.id}`, { token: t });
  assert.equal(r.status, 409);
  // l'admin global, lui, peut
  r = await call('PUT', `/groups/${S.groupId}/members/${S.dina.user.id}`, { token: S.admin.accessToken, body: { role: 'member' } });
  assert.equal(r.status, 200);
  await call('PUT', `/groups/${S.groupId}/members/${S.carol.user.id}`, { token: S.admin.accessToken, body: { role: 'admin' } });
  // un membre quitte le groupe lui-même
  r = await call('DELETE', `/groups/${S.groupId}/members/${S.dina.user.id}`, { token: S.dina.accessToken });
  assert.equal(r.status, 200);
  // révoquer une invitation de groupe
  const inv = await call('POST', `/groups/${S.groupId}/members`, { token: S.carol.accessToken, body: { email: 'eve@x.io' } });
  r = await call('DELETE', `/groups/${S.groupId}/invitations/${inv.body.id}`, { token: S.carol.accessToken });
  assert.equal(r.status, 200);
  const prev = await call('GET', `/auth/invitations/${inv.body.code}`);
  assert.equal(prev.status, 404);
});

test('rôles : promotion, garde-fou du dernier admin, désactivation', async () => {
  const t = S.admin.accessToken;
  let r = await call('PATCH', `/admin/users/${S.admin.user.id}`, { token: t, body: { role: 'user' } });
  assert.equal(r.status, 409, 'le dernier admin ne peut pas se rétrograder');
  r = await call('PATCH', `/admin/users/${S.carol.user.id}`, { token: t, body: { role: 'admin' } });
  assert.equal(r.body.role, 'admin');
  r = await call('PATCH', `/admin/users/${S.bob.user.id}`, { token: t, body: { status: 'disabled' } });
  assert.equal(r.body.status, 'disabled');
  assert.equal((await call('GET', '/me', { token: S.bob.accessToken })).status, 401, 'compte désactivé bloqué immédiatement');
  assert.equal((await call('POST', '/auth/refresh', { body: { refreshToken: S.bob.refreshToken } })).status, 401);
  const users = await call('GET', '/admin/users', { token: t });
  assert.equal(users.body.items.length, 4);
  const stats = await call('GET', '/admin/stats', { token: t });
  assert.equal(stats.body.admins, 2);
});

test('refresh : rotation et détection de réutilisation', async () => {
  const r1 = await call('POST', '/auth/refresh', { body: { refreshToken: S.admin.refreshToken } });
  assert.equal(r1.status, 200);
  const reuse = await call('POST', '/auth/refresh', { body: { refreshToken: S.admin.refreshToken } });
  assert.equal(reuse.status, 401);
  const after = await call('POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
  assert.equal(after.status, 401, 'toute la famille de jetons est révoquée après réutilisation');
});

test('page publique d’invitation', async () => {
  const res = await app.inject({ method: 'GET', url: '/invite/abcd-efgh' });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /ABCD-EFGH/);
  const xss = await app.inject({ method: 'GET', url: '/invite/%3Cscript%3E' });
  assert.doesNotMatch(xss.body, /<script>/);
});
