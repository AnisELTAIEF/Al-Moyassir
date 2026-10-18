// Validation de la mémorisation par l'enseignant + notifications (lot C). Nécessite la base de test (TEST_DB_*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const cfg = loadConfig({
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_USER: process.env.TEST_DB_USER ?? 'fifidh',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'fifidh',
  DB_NAME: process.env.TEST_DB_NAME ?? 'fifidh_test',
  JWT_SECRET: 'x'.repeat(40),
  BOOTSTRAP_ADMIN_EMAIL: 'anis.eltaief@gmail.com',
  GOOGLE_CLIENT_IDS: 'test-client',
  PUBLIC_URL: 'https://quran.example.com',
});
let app, pool;
const U = {};
const S = {};

before(async () => {
  const root = await mysql.createConnection({ ...cfg.db });
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await root.query('SHOW TABLES');
  for (const t of tables) await root.query(`DROP TABLE \`${Object.values(t)[0]}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 1');
  await root.end();
  await migrate(cfg.db, () => {});
  pool = createPool(cfg.db);
  app = await buildApp(cfg, { pool, logger: false });
});
after(async () => { await app.close(); await pool.end(); });

const call = async (method, url, { token, body } = {}) => {
  const res = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let json; try { json = JSON.parse(res.body); } catch { json = res.body; }
  return { status: res.statusCode, body: json };
};
const reg = async (key, email, name) => {
  const r = await call('POST', '/auth/register', { body: { email, password: 'motdepasse1', displayName: name } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  U[key] = { token: r.body.accessToken, id: r.body.user.id };
};
const T = (k) => ({ token: U[k].token });
const url = (org, pid, p = '') => `/orgs/${org}/students/${pid}${p}`;
const validate = (k, body, org = S.org, pid = S.pid) => call('PUT', url(org, pid, '/validation'), { ...T(k), body });
const state = (k, org = S.org, pid = S.pid) => call('GET', url(org, pid, '/validation'), T(k));
const notifs = (k) => call('GET', '/me/notifications', T(k));

// Page 3 du mushaf = 2:5 → 2:15 (11 ayat) ; page 4 commence en 2:16 (vérifié par reports.test.js).
const ayat = (from, to, result) => Array.from({ length: to - from + 1 }, (_, i) => ({ surah: 2, ayah: from + i, result }));

test('mise en place : établissement, classe, enseignant, élève lié au compte du parent', async () => {
  for (const [k, e, n] of [['admin', 'anis.eltaief@gmail.com', 'Anis'], ['orgadmin', 'orgadmin@x.io', 'Responsable'], ['teacher', 'prof1@x.io', 'Prof Un'],
    ['teacher2', 'prof2@x.io', 'Prof Deux'], ['parent', 'parent@x.io', 'Parent'], ['outsider', 'dehors@x.io', 'Dehors'], ['admin2', 'admin2@x.io', 'Resp 2']]) await reg(k, e, n);
  const org = await call('POST', '/orgs', { ...T('admin'), body: { name: 'جامع النور', type: 'mosque', adminEmail: 'orgadmin@x.io' } });
  S.org = org.body.organization.id;
  for (const email of ['prof1@x.io', 'prof2@x.io']) await call('PUT', `/orgs/${S.org}/members`, { ...T('orgadmin'), body: { email, role: 'teacher' } });
  const cls = await call('POST', `/orgs/${S.org}/classes`, { ...T('orgadmin'), body: { name: 'فوج 1' } });
  S.cls = cls.body.class.id;
  await call('PUT', `/orgs/${S.org}/classes/${S.cls}/teachers`, { ...T('orgadmin'), body: { userId: U.teacher.id } });
  const st = await call('POST', `/orgs/${S.org}/students`, { ...T('orgadmin'), body: { fullName: 'عبد الله بن محمد', fatherName: 'محمد', guardianConsent: true, groupIds: [S.cls] } });
  S.pid = st.body.student.id;
  const link = await call('POST', url(S.org, S.pid, '/link-code'), T('orgadmin'));
  assert.equal((await call('POST', '/orgs/link-student', { ...T('parent'), body: { code: link.body.code } })).status, 200);
});

test('droits : seule l’équipe de la classe valide ; élève/parent, autres enseignants et inconnus non', async () => {
  const one = { items: ayat(5, 5, 'acquired') };
  assert.equal((await call('PUT', url(S.org, S.pid, '/validation'), { body: one })).status, 401, 'sans connexion');
  assert.equal((await validate('parent', one)).status, 403, 'le parent n’est pas de l’équipe');
  assert.equal((await validate('outsider', one)).status, 404);
  assert.equal((await validate('teacher2', one)).status, 404, 'enseignant d’une autre classe');
  assert.equal((await state('teacher2')).status, 404);
  assert.equal((await validate('teacher', one)).status, 200, 'enseignant de la classe');
  assert.equal((await validate('orgadmin', { items: ayat(6, 6, 'acquired') })).status, 200, 'administratif');
  assert.equal((await validate('admin', { items: ayat(7, 7, 'acquired') })).status, 200, 'admin global');
});

test('entrées invalides refusées', async () => {
  assert.equal((await validate('teacher', { items: [{ surah: 2, ayah: 9999, result: 'acquired' }] })).body.error, 'invalid_ayah');
  assert.equal((await validate('teacher', { items: [{ surah: 115, ayah: 1, result: 'acquired' }] })).status, 400);
  assert.equal((await validate('teacher', { items: [{ surah: 2, ayah: 5, result: 'bof' }] })).status, 400);
  assert.equal((await validate('teacher', {})).status, 400, 'rien à valider');
  assert.equal((await validate('teacher', { page: 3 })).status, 400, 'page sans résultat');
  assert.equal((await validate('teacher', { page: 605, result: 'acquired' })).status, 400);
});

test('validation d’une page entière, puis lecture (D11 : page ou ayah)', async () => {
  const r = await validate('teacher', { page: 3, result: 'acquired' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.changed, 8, '11 ayat dont 3 (2:5, 2:6, 2:7) déjà acquis plus haut');
  const s = await state('teacher');
  assert.equal(s.body.items.length, 11);
  assert.deepEqual(s.body.retakePages, []);
  assert.equal(s.body.stats.ayat, 11);
  assert.equal(s.body.threshold, 3);
  assert.equal((await validate('teacher', { page: 3, result: 'acquired' })).body.changed, 0, 'idempotent : rien de nouveau');
});

test('3 ayat « avec erreur » sur la page → page à reprendre + notification à l’élève (D4)', async () => {
  const two = await validate('teacher', { items: ayat(5, 6, 'acquired_error') });
  assert.deepEqual(two.body.retakePages, [], '2 erreurs : pas encore');
  assert.equal((await notifs('parent')).body.unread, 0, 'aucune notification tant que la page n’est pas à reprendre');
  const three = await validate('teacher', { items: ayat(7, 7, 'acquired_error') });
  assert.deepEqual(three.body.retakePages, [3]);
  const n = await notifs('parent');
  assert.equal(n.body.unread, 1);
  assert.equal(n.body.notifications[0].kind, 'retake_pages');
  assert.deepEqual(n.body.notifications[0].payload.pages, [3]);
  assert.equal(n.body.notifications[0].payload.organizationName, 'جامع النور');
  const s = await state('teacher');
  assert.equal(s.body.stats.ayat, 0, 'page à reprendre : aucun ayat compté dans les rapports');
  assert.equal(s.body.items.length, 11, 'mais les résultats posés restent visibles');
  // Encore une erreur sur la même page déjà à reprendre : pas de seconde notification.
  await validate('teacher', { items: ayat(8, 8, 'acquired_error') });
  assert.equal((await notifs('parent')).body.unread, 1);
});

test('corriger : repasser en acquis fait sortir la page des pages à reprendre et recompte ses ayat', async () => {
  const fix = await validate('teacher', { items: ayat(5, 8, 'acquired') });
  assert.deepEqual(fix.body.retakePages, []);
  assert.equal((await state('teacher')).body.stats.ayat, 11);
});

test('« à revoir » : notification avec le nombre d’ayat ; effacer retire le résultat', async () => {
  await call('POST', '/me/notifications/read', { ...T('parent'), body: {} });
  assert.equal((await notifs('parent')).body.unread, 0);
  await validate('teacher', { items: ayat(9, 10, 'review') });
  const n = (await notifs('parent')).body;
  assert.equal(n.unread, 1);
  assert.equal(n.notifications[0].kind, 'review_ayat');
  assert.equal(n.notifications[0].payload.count, 2);
  assert.equal((await state('teacher')).body.stats.ayat, 9, '2 ayat à revoir ne comptent pas (11 − 2)');
  await validate('teacher', { items: ayat(9, 10, 'cleared') });
  const s = await state('teacher');
  assert.equal(s.body.items.length, 9);
  assert.ok(!s.body.items.some((i) => i.ayah === 9 || i.ayah === 10));
});

test('le journal garde tout l’historique (base des rapports par période)', async () => {
  const [[j]] = await pool.query('SELECT COUNT(*) AS n, COUNT(DISTINCT teacher_id) AS t FROM validations WHERE profile_id = ?', [S.pid]);
  assert.ok(Number(j.n) > 20, `journal : ${j.n} lignes`);
  assert.ok(Number(j.t) >= 2, 'plusieurs validateurs enregistrés');
  const [[c]] = await pool.query("SELECT COUNT(*) AS n FROM validations WHERE profile_id = ? AND result = 'cleared'", [S.pid]);
  assert.equal(Number(c.n), 2, 'les effacements sont journalisés');
});

test('indépendance : la validation ne touche pas à l’auto-marquage de l’élève, et inversement (D2, D15)', async () => {
  await call('PUT', '/me/progress', { ...T('parent'), body: { items: [{ surah: 2, ayah: 20, status: 'memorized', needsReview: true, updatedAt: new Date().toISOString() }] } });
  const count = async () => Number((await pool.query('SELECT COUNT(*) AS n FROM memorized_ayahs WHERE user_id = ?', [U.parent.id]))[0][0].n);
  const before = await count();
  await validate('teacher', { items: ayat(30, 31, 'acquired') });
  assert.equal(await count(), before, 'valider ne crée aucune ligne dans l’auto-marquage');
  const txt = JSON.stringify([(await state('teacher')).body, (await call('GET', url(S.org, S.pid, '/summary'), T('teacher'))).body, (await call('GET', url(S.org, S.pid), T('teacher'))).body]);
  assert.ok(!/needsReview|needs_review|memorized|learning/i.test(txt), 'rien de l’auto-marquage côté équipe');
  const [[own]] = await pool.query('SELECT status, ayah FROM memorized_ayahs WHERE user_id = ? AND ayah = 20', [U.parent.id]);
  assert.equal(own.status, 'memorized', 'l’auto-marquage est intact');
});

test('synthèse : global et successif en ahzab et sourates ; successif ≤ global', async () => {
  const r = await call('GET', url(S.org, S.pid, '/summary'), T('teacher'));
  assert.equal(r.status, 200);
  for (const unit of ['surahs', 'ahzab']) assert.ok(r.body.stats[unit].longestRun <= r.body.stats[unit].complete, unit);
  assert.equal(r.body.stats.ayat, 9 + 2, 'page 3 : 11 ayat moins les 2 effacés, plus 2:30-31');
  assert.ok(r.body.validatedAyat >= 11);
});

test('côté élève : ses validations, par établissement ; un inconnu n’en voit aucune', async () => {
  const mine = await call('GET', '/me/validations', T('parent'));
  assert.equal(mine.body.organizations.length, 1);
  const o = mine.body.organizations[0];
  assert.equal(o.organizationName, 'جامع النور');
  assert.equal(o.profileId, S.pid);
  assert.ok(o.items.length >= 11 && o.items.every((i) => ['acquired', 'acquired_error', 'review'].includes(i.result) && i.at));
  assert.deepEqual((await call('GET', '/me/validations', T('outsider'))).body.organizations, []);
  assert.deepEqual((await call('GET', '/me/validations', T('teacher'))).body.organizations, [], 'un enseignant n’est pas un élève');
});

test('notifications : lecture ciblée puis tout lire, et chacun ne voit que les siennes', async () => {
  await call('POST', '/me/notifications/read', { ...T('parent'), body: {} });
  await validate('teacher', { items: ayat(40, 41, 'review') });
  const n = (await notifs('parent')).body;
  assert.equal(n.unread, 1);
  assert.equal((await notifs('outsider')).body.notifications.length, 0);
  assert.equal((await call('POST', '/me/notifications/read', { ...T('outsider'), body: { ids: [n.notifications[0].id] } })).status, 200);
  assert.equal((await notifs('parent')).body.unread, 1, 'un autre compte ne peut pas lire à ma place');
  await call('POST', '/me/notifications/read', { ...T('parent'), body: { ids: [n.notifications[0].id] } });
  assert.equal((await notifs('parent')).body.unread, 0);
  assert.equal((await call('GET', '/me/notifications')).status, 401);
});

test('plusieurs établissements (D5/D19) : chacun ne compte que SES validations', async () => {
  const o2 = await call('POST', '/orgs', { ...T('admin'), body: { name: 'جمعية الفرقان', type: 'association', adminEmail: 'admin2@x.io' } });
  S.org2 = o2.body.organization.id;
  await call('PUT', `/orgs/${S.org2}/members`, { ...T('admin2'), body: { email: 'prof2@x.io', role: 'teacher' } });
  const c2 = await call('POST', `/orgs/${S.org2}/classes`, { ...T('admin2'), body: { name: 'قاعة 1' } });
  await call('PUT', `/orgs/${S.org2}/classes/${c2.body.class.id}/teachers`, { ...T('admin2'), body: { userId: U.teacher2.id } });
  const st2 = await call('POST', `/orgs/${S.org2}/students`, { ...T('admin2'), body: { fullName: 'عبد الله بن محمد', fatherName: 'محمد', guardianConsent: true, groupIds: [c2.body.class.id] } });
  S.pid2 = st2.body.student.id;
  const link = await call('POST', url(S.org2, S.pid2, '/link-code'), T('admin2'));
  await call('POST', '/orgs/link-student', { ...T('parent'), body: { code: link.body.code } });
  const before = (await state('teacher')).body.items.length;
  await validate('teacher2', { items: ayat(100, 102, 'acquired') }, S.org2, S.pid2);
  assert.equal((await state('teacher')).body.items.length, before, 'org 1 : inchangée par la validation de l’org 2');
  assert.equal((await state('teacher2', S.org2, S.pid2)).body.items.length, 3);
  assert.equal((await validate('teacher2', { items: ayat(5, 5, 'acquired') }, S.org, S.pid)).status, 404, 'pas de droit dans l’org 1');
  const mine = (await call('GET', '/me/validations', T('parent'))).body.organizations;
  assert.deepEqual(mine.map((o) => o.organizationName).sort(), ['جامع النور', 'جمعية الفرقان'].sort());
});

test('un élève sorti ne peut plus être validé', async () => {
  await call('POST', url(S.org, S.pid, '/leave'), { ...T('orgadmin'), body: {} });
  const r = await validate('teacher', { items: ayat(50, 50, 'acquired') });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'student_left');
  await call('POST', url(S.org, S.pid, '/restore'), { ...T('orgadmin'), body: {} });
  assert.equal((await validate('teacher', { items: ayat(50, 50, 'acquired') })).status, 200);
});

test('un enseignant retiré de la classe ne peut plus valider ses élèves', async () => {
  await call('DELETE', `/orgs/${S.org}/classes/${S.cls}/teachers/${U.teacher.id}`, T('orgadmin'));
  assert.equal((await validate('teacher', { items: ayat(60, 60, 'acquired') })).status, 404);
});
