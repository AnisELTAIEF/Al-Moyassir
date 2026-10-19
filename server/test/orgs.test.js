// Établissements, classes, rôles et fiches élèves (lot B). Nécessite la base de test (TEST_DB_*).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { normalizePhone } from '../src/routes/orgs.js';

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
const U = {}; // comptes de test : { token, id }
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
const student = (over = {}) => ({ fullName: 'عبد الله بن محمد', fatherName: 'محمد', guardianConsent: true, ...over });
const orgUrl = (p = '') => `/orgs/${S.org}${p}`;

test('normalisation du téléphone : format international, chiffres arabes acceptés', () => {
  assert.equal(normalizePhone('+218 91-234 5678'), '+218912345678');
  assert.equal(normalizePhone('00218 91 234 5678'), '+218912345678');
  assert.equal(normalizePhone('٠٠٢١٨٩١٢٣٤٥٦٧٨'), '+218912345678');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  assert.throws(() => normalizePhone('0912345678'), /Numéro invalide/);
  assert.throws(() => normalizePhone('+12'), /Numéro invalide/);
});

test('comptes de test', async () => {
  await reg('admin', 'anis.eltaief@gmail.com', 'Anis');
  await reg('orgadmin', 'orgadmin@x.io', 'Responsable');
  await reg('teacher', 'prof1@x.io', 'Prof Un');
  await reg('teacher2', 'prof2@x.io', 'Prof Deux');
  await reg('parent', 'parent@x.io', 'Parent');
  await reg('outsider', 'dehors@x.io', 'Dehors');
  await reg('admin2', 'admin2@x.io', 'Responsable 2');
  const me = await call('GET', '/me', T('admin'));
  assert.equal(me.body.role, 'admin');
});

test('création : réservée à l’admin global ; l’admin de l’établissement est rattaché', async () => {
  const body = { name: 'جامع النور', type: 'mosque', address: 'شارع الجمهورية، طرابلس', adminEmail: 'orgadmin@x.io' };
  assert.equal((await call('POST', '/orgs', { ...T('orgadmin'), body })).status, 403);
  assert.equal((await call('POST', '/orgs', { ...T('admin'), body: { ...body, adminEmail: 'inconnu@x.io' } })).body.error, 'user_not_found');
  assert.equal((await call('POST', '/orgs', { ...T('admin'), body: { name: 'x', type: 'autre' } })).status, 400);
  const r = await call('POST', '/orgs', { ...T('admin'), body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.organization.errorThreshold, 3, 'seuil par défaut (D4)');
  S.org = r.body.organization.id;
  const mine = await call('GET', '/orgs', T('orgadmin'));
  assert.deepEqual(mine.body.organizations.map((o) => [o.name, o.roles]), [['جامع النور', ['admin']]]);
  assert.equal((await call('GET', '/orgs', T('outsider'))).body.organizations.length, 0);
  assert.equal((await call('GET', orgUrl(), T('outsider'))).status, 404, 'un inconnu ne sait même pas qu’il existe');
});

test('seuil d’erreurs réglable par l’association (D4)', async () => {
  assert.equal((await call('PATCH', orgUrl(), { ...T('orgadmin'), body: { errorThreshold: 0 } })).status, 400);
  const r = await call('PATCH', orgUrl(), { ...T('orgadmin'), body: { errorThreshold: 4, address: 'Tripoli' } });
  assert.equal(r.body.organization.errorThreshold, 4);
  assert.equal(r.body.organization.address, 'Tripoli');
  await call('PATCH', orgUrl(), { ...T('orgadmin'), body: { errorThreshold: 3 } });
  assert.equal((await call('PATCH', orgUrl(), { ...T('outsider'), body: { name: 'pirate' } })).status, 404);
});

test('équipe : ajout par e-mail, droits, dernier admin protégé', async () => {
  const add = (email, role, who = 'orgadmin') => call('PUT', orgUrl('/members'), { ...T(who), body: { email, role } });
  assert.equal((await add('prof1@x.io', 'teacher')).status, 200);
  assert.equal((await add('prof2@x.io', 'teacher')).status, 200);
  assert.equal((await add('absent@x.io', 'teacher')).body.error, 'user_not_found');
  assert.equal((await add('prof1@x.io', 'teacher', 'teacher')).status, 403, 'un enseignant ne gère pas l’équipe');
  assert.equal((await call('GET', orgUrl('/members'), T('teacher'))).status, 403);
  const list = await call('GET', orgUrl('/members'), T('orgadmin'));
  assert.deepEqual(list.body.members.map((m) => m.roles).sort(), [['admin'], ['teacher'], ['teacher']]);
  const rm = await call('DELETE', orgUrl(`/members/${U.orgadmin.id}`), T('orgadmin'));
  assert.equal(rm.body.error, 'last_admin');
});

test('classes : créées fermées (pas de code public), enseignants affectés', async () => {
  const c = await call('POST', orgUrl('/classes'), { ...T('orgadmin'), body: { name: 'فوج 1' } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  S.cls = c.body.class.id;
  const [[g]] = await pool.query('SELECT join_open, organization_id FROM study_groups WHERE id = ?', [S.cls]);
  assert.equal(g.join_open, 0, 'jamais ouverte par code (données d’enfants)');
  assert.equal(g.organization_id, S.org);
  assert.equal((await call('POST', orgUrl('/classes'), { ...T('teacher'), body: { name: 'pirate' } })).status, 403);
  assert.equal((await call('PUT', orgUrl(`/classes/${S.cls}/teachers`), { ...T('orgadmin'), body: { userId: U.outsider.id } })).body.error, 'not_teacher');
  assert.equal((await call('PUT', orgUrl(`/classes/${S.cls}/teachers`), { ...T('orgadmin'), body: { userId: U.teacher.id } })).status, 200);
  const list = await call('GET', orgUrl('/classes'), T('orgadmin'));
  assert.deepEqual(list.body.classes[0].teachers.map((t) => t.displayName), ['Prof Un']);
  assert.equal((await call('GET', orgUrl('/classes'), T('teacher'))).body.classes.length, 1);
  assert.equal((await call('GET', orgUrl('/classes'), T('teacher2'))).body.classes.length, 0, 'prof 2 : aucune classe affectée');
});

test('élève : consentement obligatoire, téléphone normalisé, âge calculé', async () => {
  const post = (b) => call('POST', orgUrl('/students'), { ...T('orgadmin'), body: b });
  assert.equal((await post({ fullName: 'Sans consentement' })).status, 400, 'consentement absent');
  assert.equal((await post({ fullName: 'Refus', guardianConsent: false })).body.error, 'consent_required');
  assert.equal((await post(student({ phone: '0912345678' }))).body.error, 'invalid_phone');
  assert.equal((await post(student({ birthDate: '2999-01-01' }))).body.error, 'invalid_date');
  assert.equal((await post(student({ birthDate: '2015-02-30' }))).body.error, 'invalid_date', 'date impossible');
  const year = new Date().getUTCFullYear() - 10;
  const r = await post(student({ birthDate: `${year}-01-01`, gender: 'm', phone: '00218 91 234 5678', joinedAt: '2025-09-01', groupIds: [S.cls] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.student;
  S.pid = s.id;
  assert.equal(s.phone, '+218912345678');
  assert.equal(s.phoneVerified, false);
  assert.equal(s.age, 10);
  assert.equal(s.status, 'active');
  assert.equal(s.linked, false);
  assert.ok(s.guardianConsentAt, 'consentement daté');
  assert.deepEqual(s.classes.map((c) => c.name), ['فوج 1']);
});

test('doublon : même nom + même prénom du père → alerte, création possible si confirmée (D14)', async () => {
  const post = (b) => call('POST', orgUrl('/students'), { ...T('orgadmin'), body: b });
  const dup = await post(student());
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'duplicate');
  assert.equal(dup.body.duplicates[0].id, S.pid);
  const ok = await post(student({ confirmDuplicate: true }));
  assert.equal(ok.status, 200, 'homonyme confirmé');
  S.pid2 = ok.body.student.id;
  assert.equal((await post(student({ fatherName: 'علي' }))).status, 200, 'père différent : pas un doublon');
});

test('portée : un enseignant ne voit que les élèves de SES classes', async () => {
  const mineBefore = await call('GET', orgUrl('/students'), T('teacher'));
  assert.deepEqual(mineBefore.body.students.map((s) => s.id), [S.pid], 'prof 1 : l’élève de sa classe seulement');
  assert.equal((await call('GET', orgUrl(`/students/${S.pid2}`), T('teacher'))).status, 404, 'élève hors de ses classes');
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('teacher'))).status, 200);
  assert.equal((await call('GET', orgUrl('/students'), T('teacher2'))).body.students.length, 0, 'prof 2 : rien');
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('teacher2'))).status, 404);
  assert.equal((await call('GET', orgUrl('/students'), T('orgadmin'))).body.students.length, 3, 'l’admin voit tout');
  assert.equal((await call('GET', orgUrl('/students?q=علي'), T('orgadmin'))).body.students.length, 1, 'recherche par père');
  assert.equal((await call('GET', orgUrl('/students'), T('outsider'))).status, 404);
  assert.equal((await call('PATCH', orgUrl(`/students/${S.pid}`), { ...T('teacher'), body: { fullName: 'Modifié' } })).status, 403, 'un enseignant ne modifie pas la fiche');
});

test('isolation entre deux établissements', async () => {
  const o2 = await call('POST', '/orgs', { ...T('admin'), body: { name: 'جمعية الفرقان', type: 'association', adminEmail: 'admin2@x.io' } });
  S.org2 = o2.body.organization.id;
  assert.equal((await call('GET', `/orgs/${S.org2}/students`, T('admin2'))).body.students.length, 0);
  assert.equal((await call('GET', `/orgs/${S.org2}/students/${S.pid}`, T('admin2'))).status, 404, 'fiche d’un autre établissement');
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('admin2'))).status, 404, 'admin 2 n’a aucun accès à l’établissement 1');
  const c2 = await call('POST', `/orgs/${S.org2}/classes`, { ...T('admin2'), body: { name: 'قاعة 1' } });
  S.cls2 = c2.body.class.id;
  const cross = await call('PUT', orgUrl(`/classes/${S.cls2}/students`), { ...T('orgadmin'), body: { profileId: S.pid } });
  assert.equal(cross.status, 404, 'classe d’un autre établissement');
  const cross2 = await call('PUT', `/orgs/${S.org2}/classes/${S.cls2}/students`, { ...T('admin2'), body: { profileId: S.pid } });
  assert.equal(cross2.status, 404, 'élève d’un autre établissement');
});

test('plusieurs rôles dans plusieurs établissements (D5)', async () => {
  // Prof 1 est enseignant dans l'établissement 1 ; il devient aussi élève dans l'établissement 2.
  assert.equal((await call('PUT', `/orgs/${S.org2}/members`, { ...T('admin2'), body: { email: 'prof1@x.io', role: 'student' } })).status, 200);
  const mine = await call('GET', '/orgs', T('teacher'));
  const byName = Object.fromEntries(mine.body.organizations.map((o) => [o.name, o.roles]));
  assert.deepEqual(byName, { 'جامع النور': ['teacher'], 'جمعية الفرقان': ['student'] });
  assert.equal((await call('GET', `/orgs/${S.org2}/students`, T('teacher'))).status, 403, 'simple élève là-bas : aucun accès aux fiches');
  assert.equal((await call('GET', orgUrl('/students'), T('teacher'))).status, 200, 'enseignant ici');
});

test('téléphone : code à usage unique, 5 essais, invalidé si le numéro change (D3)', async () => {
  const gen = await call('POST', orgUrl(`/students/${S.pid}/phone-code`), T('teacher'));
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  assert.match(gen.body.code, /^\d{6}$/);
  const wrong = String((Number(gen.body.code) + 1) % 1_000_000).padStart(6, '0');
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', orgUrl(`/students/${S.pid}/phone-verify`), { ...T('teacher'), body: { code: wrong } })).status, 400);
  assert.equal((await call('POST', orgUrl(`/students/${S.pid}/phone-verify`), { ...T('teacher'), body: { code: gen.body.code } })).status, 400, 'bon code mais 5 essais épuisés');
  const gen2 = await call('POST', orgUrl(`/students/${S.pid}/phone-code`), T('orgadmin'));
  const ok = await call('POST', orgUrl(`/students/${S.pid}/phone-verify`), { ...T('orgadmin'), body: { code: gen2.body.code } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('orgadmin'))).body.student.phoneVerified, true);
  assert.equal((await call('POST', orgUrl(`/students/${S.pid}/phone-verify`), { ...T('orgadmin'), body: { code: gen2.body.code } })).status, 400, 'code à usage unique');
  // Le numéro change : il n'est plus vérifié.
  const patch = await call('PATCH', orgUrl(`/students/${S.pid}`), { ...T('orgadmin'), body: { phone: '+218 92 111 2222' } });
  assert.equal(patch.body.student.phone, '+218921112222');
  assert.equal(patch.body.student.phoneVerified, false, 'nouveau numéro = à revérifier');
  const nophone = await call('POST', orgUrl(`/students/${S.pid2}/phone-code`), T('orgadmin'));
  assert.equal(nophone.body.error, 'no_phone');
});

test('rattachement du compte du parent par code de liaison (D17)', async () => {
  const gen = await call('POST', orgUrl(`/students/${S.pid}/link-code`), T('orgadmin'));
  assert.equal(gen.status, 200, JSON.stringify(gen.body));
  assert.match(gen.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await call('POST', orgUrl(`/students/${S.pid}/link-code`), T('teacher'))).status, 403);
  assert.equal((await call('POST', '/orgs/link-student', { ...T('parent'), body: { code: 'AAAA-BBBB' } })).body.error, 'invalid_code');
  const link = await call('POST', '/orgs/link-student', { ...T('parent'), body: { code: gen.body.code.toLowerCase() } });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.body.organization.name, 'جامع النور');
  assert.equal((await call('POST', '/orgs/link-student', { ...T('outsider'), body: { code: gen.body.code } })).body.error, 'invalid_code', 'code à usage unique');
  const mine = await call('GET', '/orgs', T('parent'));
  assert.deepEqual(mine.body.organizations.map((o) => o.roles), [['student']]);
  assert.equal((await call('GET', orgUrl('/students'), T('parent'))).status, 403, 'un élève/parent ne voit aucune fiche');
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('orgadmin'))).body.student.linked, true);
  await call('POST', orgUrl(`/students/${S.pid}/unlink`), T('orgadmin'));
  assert.equal((await call('GET', orgUrl(`/students/${S.pid}`), T('orgadmin'))).body.student.linked, false);
  assert.equal((await call('GET', '/orgs', T('parent'))).body.organizations.length, 0, 'rôle « élève » retiré');
});

test('vie privée : la fiche ne contient jamais la progression ni les marques personnelles (D15)', async () => {
  const gen = await call('POST', orgUrl(`/students/${S.pid}/link-code`), T('orgadmin'));
  await call('POST', '/orgs/link-student', { ...T('parent'), body: { code: gen.body.code } });
  const put = await call('PUT', '/me/progress', { ...T('parent'), body: { items: [{ surah: 1, ayah: 1, status: 'memorized', needsReview: true, updatedAt: new Date().toISOString() }] } });
  assert.ok(put.status < 300, JSON.stringify(put.body));
  const as = async (k, url) => JSON.stringify((await call('GET', url, T(k))).body);
  for (const [k, url] of [['orgadmin', orgUrl(`/students/${S.pid}`)], ['teacher', orgUrl(`/students/${S.pid}`)], ['orgadmin', orgUrl('/students')]]) {
    const txt = await as(k, url);
    assert.ok(!/memorized|needsReview|needs_review|learning|progress/i.test(txt), `${k} ${url} : ${txt.slice(0, 200)}`);
  }
});

test('sortie d’un élève : archivage, conservation 5 ans, purge manuelle seulement ensuite (D20)', async () => {
  const left = await call('POST', orgUrl(`/students/${S.pid2}/leave`), { ...T('orgadmin'), body: { leftAt: '2026-06-30' } });
  assert.equal(left.status, 200, JSON.stringify(left.body));
  assert.equal(left.body.student.status, 'left');
  assert.equal(left.body.student.retainUntil, '2031-06-30');
  const active = await call('GET', orgUrl('/students'), T('orgadmin'));
  assert.ok(!active.body.students.some((s) => s.id === S.pid2), 'sorti : absent de la liste courante');
  const all = await call('GET', orgUrl('/students?status=all'), T('orgadmin'));
  assert.ok(all.body.students.some((s) => s.id === S.pid2), 'mais conservé');
  assert.equal((await call('DELETE', orgUrl(`/students/${S.pid2}`), T('orgadmin'))).status, 403, 'admin local : pas de suppression définitive');
  assert.equal((await call('DELETE', orgUrl(`/students/${S.pid2}`), T('admin'))).body.error, 'retention', 'avant 5 ans : refusé');
  assert.equal((await call('DELETE', orgUrl(`/students/${S.pid}`), T('admin'))).body.error, 'retention', 'élève encore actif : refusé');
  await pool.query("UPDATE student_profiles SET retain_until = '2020-01-01' WHERE id = ?", [S.pid2]); // simule le passage des 5 ans
  assert.equal((await call('DELETE', orgUrl(`/students/${S.pid2}`), T('admin'))).status, 200);
  const [rows] = await pool.query('SELECT 1 FROM student_profiles WHERE id = ?', [S.pid2]);
  assert.equal(rows.length, 0);
  const back = await call('POST', orgUrl(`/students/${S.pid}/leave`), T('orgadmin'));
  assert.equal(back.body.student.retainUntil, `${Number(new Date().toISOString().slice(0, 4)) + 5}${new Date().toISOString().slice(4, 10)}`);
  const restored = await call('POST', orgUrl(`/students/${S.pid}/restore`), T('orgadmin'));
  assert.equal(restored.body.student.status, 'active');
  assert.equal(restored.body.student.retainUntil, null);
});

test('retrait d’un enseignant : il quitte aussi ses classes', async () => {
  const rm = await call('DELETE', orgUrl(`/members/${U.teacher.id}?role=teacher`), T('orgadmin'));
  assert.equal(rm.status, 200);
  const [rows] = await pool.query('SELECT 1 FROM group_teachers WHERE user_id = ?', [U.teacher.id]);
  assert.equal(rows.length, 0);
  assert.equal((await call('GET', orgUrl('/students'), T('teacher'))).status, 404, 'plus aucun rôle ici');
});

test('étiquette « ضمن النخبة » : posée par l’équipe, visible sur la fiche', async () => {
  const st = (await call('POST', orgUrl('/students'), { ...T('orgadmin'), body: { fullName: 'Élève Étiqueté', fatherName: 'أب', guardianConsent: true } })).body.student;
  assert.equal(st.eliteTag, false);
  const on = await call('PUT', orgUrl(`/students/${st.id}/elite`), { ...T('orgadmin'), body: { elite: true } });
  assert.equal(on.status, 200);
  assert.equal(on.body.student.eliteTag, true);
  assert.equal((await call('PUT', orgUrl(`/students/${st.id}/elite`), { ...T('orgadmin'), body: { elite: false } })).body.student.eliteTag, false);
  assert.equal((await call('PUT', orgUrl(`/students/${st.id}/elite`), { ...T('orgadmin'), body: {} })).status, 400);
});

test('autorisation des parents : exigée jusqu’à 14 ans ou âge inconnu, plus au-delà', async () => {
  const post = (b) => call('POST', orgUrl('/students'), { ...T('orgadmin'), body: b });
  // Plus de 14 ans : l'autorisation des parents n'est plus exigée ; âge inconnu ou ≤ 14 ans : elle l'est.
  const old = new Date(); old.setUTCFullYear(old.getUTCFullYear() - 20);
  const grown = await post({ fullName: 'Adulte Sans Accord', birthDate: old.toISOString().slice(0, 10) });
  assert.equal(grown.status, 200);
  assert.equal(grown.body.student.guardianConsentAt, null);
  const kid = new Date(); kid.setUTCFullYear(kid.getUTCFullYear() - 10);
  assert.equal((await post({ fullName: 'Enfant Sans Accord', birthDate: kid.toISOString().slice(0, 10) })).body.error, 'consent_required');
  assert.equal((await post({ fullName: 'Age Inconnu' })).body.error, 'consent_required');
});
