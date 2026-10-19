// Tests d'intégration : nécessitent une base MariaDB vide (variables TEST_DB_*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { placeName } from '../src/routes/geocode.js';
import { buildInvitationMail, invitationKind } from '../src/inviteMail.js';
import net from 'node:net';
import * as bulk from '../src/bulkImport.js';

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

test('inscription ouverte : un inconnu crée son compte (rôle utilisateur) par Google et par mot de passe', async () => {
  const g = await google('s-x', 'inconnu@x.io', 'Inconnu');
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.user.role, 'user');
  const r = await call('POST', '/auth/register', { body: { email: 'inconnu2@x.io', password: 'motdepasse1', displayName: 'Inc' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.role, 'user');
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
  // D'autres tests créent aussi des comptes : on vérifie le contenu, pas un nombre exact.
  const byId = new Map(users.body.items.map((u) => [u.id, u]));
  for (const k of ['admin', 'bob', 'carol']) assert.ok(byId.has(S[k].user.id), `${k} présent dans la liste`);
  assert.equal(byId.get(S.carol.user.id).role, 'admin');
  assert.equal(byId.get(S.bob.user.id).status, 'disabled');
  const stats = await call('GET', '/admin/stats', { token: t });
  assert.equal(stats.body.admins, 2);
});

test('code de groupe et code d’invitation : un seul champ, e-mail et groupe pré-remplis', async () => {
  const t = S.admin.accessToken;
  const g = await call('POST', '/admin/groups', { token: t, body: { name: 'Halaqa du soir' } });
  assert.match(g.body.joinCode, /^[A-Z2-9]{6}$/);
  const spaced = g.body.joinCode.toLowerCase().replace(/^(...)/, '$1 ');
  let r = await call('GET', `/auth/codes/${encodeURIComponent(spaced)}`);
  assert.deepEqual(r.body, { type: 'group', groupName: 'Halaqa du soir' });
  // Code de groupe saisi dans le champ « code » : compte créé et membre du groupe.
  r = await call('POST', '/auth/register', { body: { email: 'eve@x.io', password: 'motdepasse1', displayName: 'Eve', invitationCode: spaced } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const eve = r.body;
  let mine = await call('GET', '/me/groups', { token: eve.accessToken });
  assert.deepEqual(mine.body.items.map((x) => [x.name, x.role]), [['Halaqa du soir', 'member']]);
  // Invitation par e-mail : le code suffit, l'e-mail vient de l'invitation.
  const inv = await call('POST', '/admin/invitations', { token: t, body: { email: 'fred@x.io', groupId: g.body.id } });
  r = await call('GET', `/auth/codes/${inv.body.code}`);
  assert.equal(r.body.type, 'invitation');
  assert.equal(r.body.email, 'fred@x.io');
  assert.equal(r.body.groupName, 'Halaqa du soir');
  r = await call('POST', '/auth/register', { body: { email: 'autre@x.io', password: 'motdepasse1', displayName: 'Fred', invitationCode: inv.body.code } });
  assert.equal(r.body.error, 'email_mismatch');
  r = await call('POST', '/auth/register', { body: { password: 'motdepasse1', displayName: 'Fred', invitationCode: inv.body.code } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.email, 'fred@x.io');
  // Un compte existant rejoint un autre groupe avec son code.
  const ov = await call('GET', `/groups/${S.groupId}/overview`, { token: t });
  r = await call('POST', '/me/groups/join', { token: eve.accessToken, body: { code: ov.body.group.joinCode } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  mine = await call('GET', '/me/groups', { token: eve.accessToken });
  assert.equal(mine.body.items.length, 2);
  // Nouveau code : l'ancien ne marche plus.
  const re = await call('POST', `/groups/${g.body.id}/join-code`, { token: t });
  assert.notEqual(re.body.joinCode, g.body.joinCode);
  assert.equal((await call('GET', `/auth/codes/${g.body.joinCode}`)).status, 404);
  // Inscription ouverte : un nouvel e-mail crée un compte sans code (rôle utilisateur).
  r = await call('POST', '/auth/register', { body: { email: 'libre@x.io', password: 'motdepasse1', displayName: 'Libre' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.role, 'user');
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

test('réinitialisation du mot de passe par l’admin', async () => {
  const reg = await call('POST', '/auth/register', { body: { email: 'reset-me@x.io', password: 'ancienMotDePasse1', displayName: 'Reset Me' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const uid = reg.body.user.id;
  const gen = await call('POST', `/admin/users/${uid}/reset-password`, { token: S.admin.accessToken });
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  assert.match(gen.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const done = await call('POST', '/auth/reset-password', { body: { code: gen.body.code, password: 'tfNouveau2024' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.user.id, uid);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'reset-me@x.io', password: 'tfNouveau2024' } })).status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'reset-me@x.io', password: 'ancienMotDePasse1' } })).status, 401, 'ancien mot de passe invalidé');
  assert.equal((await call('POST', '/auth/reset-password', { body: { code: gen.body.code, password: 'encoreAutre1' } })).status, 400, 'code à usage unique');
});

test('géocodage inverse : nom court du lieu et validation des coordonnées', async () => {
  assert.equal(placeName({ address: { city: 'Monastir', state: 'Gouvernorat de Monastir', country: 'Tunisie' } }), 'Monastir, Tunisie');
  assert.equal(placeName({ address: { village: 'Ksibet el-Médiouni', country: 'Tunisie' } }), 'Ksibet el-Médiouni, Tunisie');
  assert.equal(placeName({ address: { state: 'Tripoli', country: 'Libye' } }), 'Tripoli, Libye');
  // Tunisie : secteur < délégation < gouvernorat ; on affiche la délégation, sans son préfixe.
  assert.equal(placeName({ address: { county: 'El Halia 2', state_district: 'Délégation Monastir', state: 'Gouvernorat Monastir', country: 'Tunisie' } }), 'Monastir, Tunisie');
  assert.equal(placeName({ address: { state_district: 'معتمدية المنستير', country: 'تونس' } }), 'المنستير, تونس');
  assert.equal(placeName({}), null);
  // Coordonnées manquantes ou hors limites : refusées avant tout appel externe.
  assert.equal((await call('GET', '/geocode/reverse?lat=36.8')).status, 400);
  assert.equal((await call('GET', '/geocode/reverse?lat=95&lng=10')).status, 400);
});

test('e-mail d’invitation : liens en tête, en bref, en détail, guide — adapté au rôle', () => {
  const cfg = { publicUrl: 'https://quran.exemple.tn', androidApkUrl: 'https://exemple.tn/almoyassir.apk' };
  const base = { email: 'x@exemple.tn', code: 'K7XQ-M2PA', groupName: 'Halaqa', inviterName: 'Anis', expiresAt: new Date('2026-10-29T12:00:00Z') };
  const member = buildInvitationMail(cfg, { ...base, role: 'user', groupId: 'g1', groupRole: 'member' });
  const gadmin = buildInvitationMail(cfg, { ...base, role: 'user', groupId: 'g1', groupRole: 'admin' });
  const admin = buildInvitationMail(cfg, { ...base, role: 'admin', groupId: null, groupRole: 'member' });
  assert.equal(invitationKind({ role: 'user', groupId: 'g1', groupRole: 'admin' }), 'groupAdmin');
  for (const m of [member, gadmin, admin]) {
    const t = m.text;
    // Ordre demandé : liens, puis « en bref », puis « en détail », puis le guide.
    assert.ok(t.indexOf('LIENS UTILES') < t.indexOf('EN BREF') && t.indexOf('EN BREF') < t.indexOf('EN DÉTAIL'));
    assert.ok(t.indexOf('EN DÉTAIL') < t.indexOf('guide détaillé'));
    assert.match(t, /K7XQ-M2PA/);
    assert.match(t, /https:\/\/quran\.exemple\.tn\/app\//);
    assert.match(t, /almoyassir\.apk/);
    assert.match(m.html, /<html/);
  }
  assert.doesNotMatch(member.text, /Admin web/, 'pas d’admin web pour un membre');
  assert.match(member.text, /guide\/#membre/);
  assert.match(gadmin.subject, /admin du groupe « Halaqa »/);
  assert.match(gadmin.text, /Gérer votre groupe/);
  assert.match(gadmin.text, /guide\/#admin-groupe/);
  assert.match(admin.text, /Administrer Almoyassir/);
  assert.match(admin.text, /guide\/#admin-general/);
  assert.ok(admin.text.length > member.text.length, 'plus détaillé pour les admins');
  assert.doesNotMatch(member.html, /<script/i);
});

test('invitation : envoi automatique par SMTP quand il est configuré, sinon message à copier', async () => {
  const t = S.admin.accessToken;
  let r = await call('POST', '/admin/invitations', { token: t, body: { email: 'smtp-off@exemple.tn' } });
  assert.equal(r.body.emailed, false);
  assert.equal(r.body.mailConfigured, false);
  assert.match(r.body.message, /EN DÉTAIL/);
  assert.match(r.body.subject, /Almoyassir/);

  // Petit serveur SMTP local : vérifie que l'e-mail part vraiment (destinataire, sujet, HTML).
  const received = [];
  const smtp = net.createServer((sock) => {
    let data = false; let buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') { data = false; sock.write('250 OK\r\n'); } else received.push(line);
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test\r\n250 OK\r\n');
        else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise((res) => smtp.listen(0, '127.0.0.1', res));
  const saved = { ...app.cfg.smtp };
  Object.assign(app.cfg.smtp, { host: '127.0.0.1', port: smtp.address().port, user: '', pass: '', from: 'noreply@exemple.tn', requireTls: false });
  try {
    r = await call('POST', '/admin/invitations', { token: t, body: { email: 'smtp-on@exemple.tn', role: 'admin' } });
    assert.equal(r.body.emailed, true);
    const mail = received.join('\n');
    assert.match(mail, /To: smtp-on@exemple\.tn/);
    assert.match(mail, /text\/html/);
    assert.match(mail, /Subject: /);
  } finally {
    Object.assign(app.cfg.smtp, saved);
    smtp.close();
  }
});

/** Petit serveur SMTP local qui garde les messages reçus. */
async function fakeSmtp() {
  const received = [];
  let current = [];
  const server = net.createServer((sock) => {
    let data = false; let buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') { data = false; received.push(current.join('\n')); current = []; sock.write('250 OK\r\n'); } else current.push(line);
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test\r\n250 OK\r\n');
        else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { received, port: server.address().port, close: () => server.close() };
}

test('import dans un groupe (admin de groupe) : simulation puis import, comptes existants et invitations', async () => {
  const r0 = await call('PUT', `/admin/groups/${S.groupId}/members/${S.dina.user.id}`, { token: S.carol.accessToken, body: { role: 'admin' } });
  assert.equal(r0.status, 200, JSON.stringify(r0.body));
  const t = S.dina.accessToken; // admin du groupe « Halaqa » (et pas admin général)
  const text = 'Nom complet ; Adresse e-mail\n'
    + 'Inconnu Deux ; inconnu2@x.io\n'      // compte existant, pas dans le groupe → ajouté
    + 'Carol ; carol@x.io\n'                // déjà admin du groupe → inchangé
    + 'Hamza Trabelsi ; hamza@x.io\n'       // nouveau → invité
    + 'Lina Ben Salah, lina@x.io\n'         // séparateur « , » accepté
    + 'Juste un nom\n'                      // erreur
    + 'Hamza encore ; HAMZA@x.io\n';        // doublon → erreur
  const dry = await call('POST', `/groups/${S.groupId}/import`, { token: t, body: { text } });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.dryRun, true);
  assert.deepEqual(
    [dry.body.summary.added, dry.body.summary.unchanged, dry.body.summary.invited, dry.body.summary.errors], [1, 1, 2, 2]);
  const [[before]] = await pool.query("SELECT COUNT(*) c FROM invitations WHERE email IN ('hamza@x.io','lina@x.io')");
  assert.equal(Number(before.c), 0, 'la simulation ne crée rien');

  const run = await call('POST', `/groups/${S.groupId}/import`, { token: t, body: { text, dryRun: false } });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const hamza = run.body.items.find((x) => x.email === 'hamza@x.io');
  assert.equal(hamza.action, 'invited');
  assert.match(hamza.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const ov = await call('GET', `/groups/${S.groupId}/overview`, { token: t });
  assert.ok(ov.body.members.some((m) => m.email === 'inconnu2@x.io'));
  // Le nom importé est pré-rempli à l'inscription.
  const pv = await call('GET', `/auth/codes/${hamza.code}`);
  assert.equal(pv.body.displayName, 'Hamza Trabelsi');
  // Relancer le même import ne réinvite personne.
  const again = await call('POST', `/groups/${S.groupId}/import`, { token: t, body: { text, dryRun: false } });
  assert.equal(again.body.summary.invited, 0);
  // Pas d'import dans un autre groupe, ni d'import général pour un admin de groupe.
  assert.equal((await call('POST', `/groups/${S.otherGroup}/import`, { token: t, body: { text } })).status, 403);
  assert.equal((await call('POST', '/admin/import', { token: t, body: { text: 'G;N;a@b.cc' } })).status, 403);
});

test('import général : crée les groupes, admins de groupe, une seule invitation par personne, e-mails envoyés', async () => {
  const t = S.admin.accessToken;
  const smtp = await fakeSmtp();
  const saved = { ...app.cfg.smtp };
  Object.assign(app.cfg.smtp, { host: '127.0.0.1', port: smtp.port, user: '', pass: '', from: 'noreply@exemple.tn', requireTls: false });
  try {
    const [[halaqa]] = await pool.query('SELECT name FROM study_groups WHERE id = ?', [S.groupId]);
    const text = 'Groupe;Nom complet;E-mail;Rôle\n'
      + 'Halaqa Nour;Youssef Admin;youssef@x.io;admin\n'
      + 'Halaqa Nour;Mariem;mariem@x.io;membre\n'
      + 'Halaqa Fajr;Mariem;mariem@x.io\n'          // même personne, 2e groupe
      + `${halaqa.name};Inconnu;inconnu@x.io;admin\n`  // compte existant → ajouté comme admin   // compte existant → nommé admin
      + ';Sans Groupe;libre-import@x.io\n'
      + 'Halaqa Nour;X;x@x.io;chef\n';             // rôle inconnu
    const dry = await call('POST', '/admin/import', { token: t, body: { text } });
    assert.equal(dry.status, 200, JSON.stringify(dry.body));
    assert.deepEqual(dry.body.summary.groupsCreated.sort(), ['Halaqa Fajr', 'Halaqa Nour']);
    const [[g0]] = await pool.query("SELECT COUNT(*) c FROM study_groups WHERE name LIKE 'Halaqa N%'");
    assert.equal(Number(g0.c), 0, 'la simulation ne crée pas de groupe');

    const run = await call('POST', '/admin/import', { token: t, body: { text, dryRun: false } });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    const s = run.body.summary;
    assert.deepEqual([s.invited, s.added + s.updated, s.errors], [4, 1, 1]);
    const [[inc]] = await pool.query(
      "SELECT gm.role FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND u.email = 'inconnu@x.io'", [S.groupId]);
    assert.equal(inc.role, 'admin');
    assert.equal(run.body.emailing, 3, 'Mariem ne reçoit qu’un seul e-mail');
    await bulk.lastImportMailing;
    // 3 invitations + 1 e-mail « vous avez rejoint le groupe » pour le compte existant (rien d'autre n'est modifié).
    assert.equal(smtp.received.length, 4);
    assert.ok(smtp.received.some((m) => /To: youssef@x\.io/.test(m)));
    assert.ok(smtp.received.some((m) => /To: inconnu@x\.io/.test(m) && /conserv/i.test(m)), 'le compte existant est prévenu, sans nouveau code');
    const [[sent]] = await pool.query("SELECT COUNT(*) c FROM invitations WHERE emailed_at IS NOT NULL AND email IN ('youssef@x.io','mariem@x.io','libre-import@x.io')");
    assert.equal(Number(sent.c), 3);

    const [[nour]] = await pool.query("SELECT id, join_code FROM study_groups WHERE name = 'Halaqa Nour'");
    assert.match(nour.join_code, /^[A-Z2-9]{6}$/);
    // Mariem crée son compte avec le code reçu : elle rejoint ses DEUX groupes.
    const code = run.body.items.find((x) => x.email === 'mariem@x.io' && x.group === 'Halaqa Nour').code;
    const reg = await call('POST', '/auth/register', { body: { password: 'motdepasse1', displayName: 'Mariem', invitationCode: code } });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    const mine = await call('GET', '/me/groups', { token: reg.body.accessToken });
    assert.deepEqual(mine.body.items.map((g) => g.name).sort(), ['Halaqa Fajr', 'Halaqa Nour']);
    // Youssef est invité comme admin du groupe.
    const [[y]] = await pool.query("SELECT group_role FROM invitations WHERE email = 'youssef@x.io'");
    assert.equal(y.group_role, 'admin');
  } finally {
    Object.assign(app.cfg.smtp, saved);
    smtp.close();
  }
});

test('APK Android hébergé sur le serveur : /download/android et lien dans l’e-mail', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const savedFile = app.cfg.apkFile;
  app.cfg.apkFile = '/nonexistent/Almoyassir.apk';
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/download/android' })).statusCode, 404);
    const dir = await mkdtemp(`${tmpdir()}/apk-`);
    app.cfg.apkFile = `${dir}/Almoyassir.apk`;
    await writeFile(app.cfg.apkFile, Buffer.from('PK fake apk'));
    const res = await app.inject({ method: 'GET', url: '/download/android' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/vnd.android.package-archive');
    assert.match(res.headers['content-disposition'], /Almoyassir\.apk/);
    assert.equal(res.body, 'PK fake apk');
    // Un APK déposé plus tard (même sous un autre nom) devient automatiquement celui du lien.
    const { utimes } = await import('node:fs/promises');
    await writeFile(`${dir}/Almoyassir-0.99.0-arm64.apk`, Buffer.from('PK newer apk'));
    await utimes(`${dir}/Almoyassir.apk`, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    const newer = await app.inject({ method: 'GET', url: '/download/android' });
    assert.equal(newer.body, 'PK newer apk');
    assert.match(newer.headers['content-disposition'], /0\.99\.0/);
    const r = await call('POST', '/admin/invitations', { token: S.admin.accessToken, body: { email: 'apk@x.io' } });
    assert.match(r.body.message, /https:\/\/quran\.example\.com\/api\/download\/android/);
  } finally {
    app.cfg.apkFile = savedFile;
  }
});
