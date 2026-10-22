// Résultats, certificats, récompenses, alertes push, classement et rythme (lots D, E, G). Nécessite la base de test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import mysql from 'mysql2/promise';
import { migrate } from '../src/migrate.js';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { sniffMime } from '../src/certFiles.js';
import { validPushEndpoint } from '../src/routes/push.js';
import { periodStart } from '../src/routes/reports.js';

let certDir, app, pool, cfg;
const pushes = []; // alertes « envoyées »
let pushFails = null; // statut HTTP simulé pour l'envoi suivant (410 = abonnement expiré)
const fakePush = async (sub, payload) => {
  if (pushFails) { const e = new Error('gone'); e.statusCode = pushFails; throw e; }
  pushes.push({ endpoint: sub.endpoint, ...JSON.parse(payload) });
};
const fcmPushes = []; // alertes Android « envoyées »
let fcmFails = null; // { unregistered } simulé pour l'envoi suivant
const fakeFcm = async (token, msg) => {
  if (fcmFails) { const e = new Error('fcm'); Object.assign(e, fcmFails); throw e; }
  fcmPushes.push({ token, ...msg });
};
const U = {}, S = {};

before(async () => {
  certDir = await mkdtemp(`${tmpdir()}/certs-`);
  cfg = loadConfig({
    DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1', DB_USER: process.env.TEST_DB_USER ?? 'fifidh',
    DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'fifidh', DB_NAME: process.env.TEST_DB_NAME ?? 'fifidh_test',
    JWT_SECRET: 'x'.repeat(40), BOOTSTRAP_ADMIN_EMAIL: 'anis.eltaief@gmail.com', GOOGLE_CLIENT_IDS: 'test-client',
    PUBLIC_URL: 'https://quran.example.com', CERT_DIR: certDir,
  });
  const root = await mysql.createConnection({ ...cfg.db });
  await root.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tables] = await root.query('SHOW TABLES');
  for (const t of tables) await root.query(`DROP TABLE \`${Object.values(t)[0]}\``);
  await root.query('SET FOREIGN_KEY_CHECKS = 1');
  await root.end();
  await migrate(cfg.db, () => {});
  pool = createPool(cfg.db);
  app = await buildApp(cfg, { pool, logger: false, pushSender: fakePush, fcmSender: fakeFcm });
});
after(async () => { await app.close(); await pool.end(); await rm(certDir, { recursive: true, force: true }); });

const call = async (method, url, { token, body } = {}) => {
  const res = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let json; try { json = JSON.parse(res.body); } catch { json = res.body; }
  return { status: res.statusCode, body: json, raw: res };
};
const reg = async (k, email, name) => {
  const r = await call('POST', '/auth/register', { body: { email, password: 'motdepasse1', displayName: name } });
  U[k] = { token: r.body.accessToken, id: r.body.user.id };
};
const T = (k) => ({ token: U[k].token });
const stUrl = (p = '') => `/orgs/${S.org}/students/${S.pid}${p}`;
const b64 = (buf) => buf.toString('base64');
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
const ayat = (from, to, result) => Array.from({ length: to - from + 1 }, (_, i) => ({ surah: 2, ayah: from + i, result }));
const cert = (k, over = {}, org = S.org, pid = S.pid) => call('POST', `/orgs/${org}/students/${pid}/certificates`,
  { ...T(k), body: { title: 'شهادة حفظ جزء عمّ', issuedOn: '2026-09-01', fileName: 'cert.pdf', dataBase64: b64(PDF), ...over } });
const notifs = async (k) => (await call('GET', '/me/notifications', T(k))).body;

test('unités : type de fichier réel, adresses push, périodes', () => {
  assert.equal(sniffMime(PDF), 'application/pdf');
  assert.equal(sniffMime(PNG), 'image/png');
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(sniffMime(Buffer.alloc(0)), null);
  assert.ok(validPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(validPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'));
  assert.ok(validPushEndpoint('https://web.push.apple.com/abc'));
  for (const bad of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://evil.example.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://fcm.googleapis.com:8443/x', 'javascript:alert(1)', 'pas une url']) {
    assert.equal(validPushEndpoint(bad), false, bad);
  }
  const d = new Date(Date.UTC(2026, 10, 17)); // 17 novembre 2026
  assert.equal(periodStart('month', d).toISOString().slice(0, 10), '2026-11-01');
  assert.equal(periodStart('quarter', d).toISOString().slice(0, 10), '2026-10-01');
  assert.equal(periodStart('semester', d).toISOString().slice(0, 10), '2026-07-01');
  assert.equal(periodStart('year', d).toISOString().slice(0, 10), '2026-01-01');
  assert.equal(periodStart('all', d), null);
});

test('mise en place', async () => {
  for (const [k, e, n] of [['admin', 'anis.eltaief@gmail.com', 'Anis'], ['orgadmin', 'orgadmin@x.io', 'Resp'], ['teacher', 'prof1@x.io', 'Prof'],
    ['teacher2', 'prof2@x.io', 'Prof2'], ['parent', 'parent@x.io', 'Parent'], ['parent2', 'parent2@x.io', 'Parent2'], ['outsider', 'dehors@x.io', 'Dehors']]) await reg(k, e, n);
  S.org = (await call('POST', '/orgs', { ...T('admin'), body: { name: 'جامع النور', type: 'mosque', adminEmail: 'orgadmin@x.io' } })).body.organization.id;
  for (const email of ['prof1@x.io', 'prof2@x.io']) await call('PUT', `/orgs/${S.org}/members`, { ...T('orgadmin'), body: { email, role: 'teacher' } });
  S.cls = (await call('POST', `/orgs/${S.org}/classes`, { ...T('orgadmin'), body: { name: 'فوج 1' } })).body.class.id;
  await call('PUT', `/orgs/${S.org}/classes/${S.cls}/teachers`, { ...T('orgadmin'), body: { userId: U.teacher.id } });
  const mk = async (fullName, link) => {
    const r = await call('POST', `/orgs/${S.org}/students`, { ...T('orgadmin'), body: { fullName, fatherName: 'أب', guardianConsent: true, groupIds: [S.cls] } });
    if (link) await call('POST', '/orgs/link-student', { ...T(link), body: { code: (await call('POST', `/orgs/${S.org}/students/${r.body.student.id}/link-code`, T('orgadmin'))).body.code } });
    return r.body.student.id;
  };
  S.pid = await mk('أحمد الأول', 'parent');
  S.pidB = await mk('بلال الثاني', null);
  S.pidC = await mk('جمال الثالث', 'parent2');
});

test('examens et concours : l’administratif les saisit, l’élève les voit', async () => {
  const body = { kind: 'competition', title: 'مسابقة الحفظ الولائية', heldOn: '2026-08-15', score: '18/20', rank: '2' };
  assert.equal((await call('POST', stUrl('/assessments'), { ...T('teacher'), body })).status, 403, 'un enseignant ne saisit pas les résultats');
  assert.equal((await call('POST', stUrl('/assessments'), { ...T('orgadmin'), body: { ...body, heldOn: '2026-02-31' } })).body.error, 'invalid_date');
  assert.equal((await call('POST', stUrl('/assessments'), { ...T('orgadmin'), body: { ...body, kind: 'autre' } })).status, 400);
  const r = await call('POST', stUrl('/assessments'), { ...T('orgadmin'), body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  S.aid = r.body.assessment.id;
  const mine = (await call('GET', '/me/results', T('parent'))).body.organizations[0];
  assert.equal(mine.organizationName, 'جامع النور');
  assert.deepEqual(mine.assessments.map((a) => [a.title, a.heldOn, a.score, a.rank]), [['مسابقة الحفظ الولائية', '2026-08-15', '18/20', '2']]);
  assert.deepEqual((await call('GET', '/me/results', T('parent2'))).body.organizations[0].assessments, [], 'chaque élève ne voit que les siens');
});

test('certificat : type vérifié sur le contenu, stockage hors base, notification à l’élève, historique', async () => {
  assert.equal((await cert('teacher')).status, 403, 'seul l’administratif téléverse');
  assert.equal((await cert('parent')).status, 403);
  assert.equal((await cert('orgadmin', { dataBase64: b64(Buffer.from('<html>pas un pdf</html>')) })).body.error, 'invalid_file');
  assert.equal((await cert('orgadmin', { dataBase64: '' })).status, 400);
  assert.equal((await cert('orgadmin', { dataBase64: b64(Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)])) })).body.error, 'invalid_file', 'plus de 5 Mo');
  assert.equal((await cert('orgadmin', { assessmentId: S.aid.replace(/.$/, (c) => (c === '0' ? '1' : '0')) })).body.error, 'invalid_assessment');
  const ok = await cert('orgadmin', { assessmentId: S.aid, fileName: '../../etc/passwd.pdf' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  S.cid = ok.body.certificate.id;
  assert.equal(ok.body.certificate.mime, 'application/pdf');
  assert.ok(!ok.body.certificate.fileName.includes('/'), 'nom de fichier assaini');
  assert.equal((await stat(`${certDir}/${S.org}/${S.cid}`)).size, PDF.length, 'fichier écrit hors base');
  const n = (await notifs('parent')).notifications[0];
  assert.equal(n.kind, 'certificate');
  assert.equal(n.payload.title, 'شهادة حفظ جزء عمّ');
  assert.equal((await cert('orgadmin', { title: 'شهادة ثانية', issuedOn: '2026-10-01' })).status, 200);
  const hist = (await call('GET', '/me/results', T('parent'))).body.organizations[0].certificates;
  assert.deepEqual(hist.map((c) => c.issuedOn), ['2026-10-01', '2026-09-01'], 'historique complet, du plus récent au plus ancien');
  assert.equal((await call('GET', stUrl('/results'), T('teacher'))).body.certificates.length, 2, 'l’enseignant de la classe les voit');
  assert.equal((await call('GET', stUrl('/results'), T('teacher2'))).status, 404);
});

test('téléchargement : lien de 5 min, réservé à l’élève concerné et à son équipe', async () => {
  const link = await call('GET', `/me/certificates/${S.cid}/link`, T('parent'));
  assert.equal(link.status, 200);
  const url = new URL(link.body.url);
  const path = `${url.pathname.replace(/^\/api/, '')}${url.search}`;
  const file = await call('GET', path);
  assert.equal(file.status, 200);
  assert.equal(file.raw.headers['content-type'], 'application/pdf');
  assert.equal(file.raw.headers['x-content-type-options'], 'nosniff');
  assert.equal(Buffer.from(file.raw.rawPayload).length, PDF.length);
  assert.equal((await call('GET', `/files/certificates/${S.cid}?t=n-importe-quoi`)).status, 403, 'jeton falsifié');
  assert.equal((await call('GET', `/files/certificates/${S.cid}`)).status, 400, 'sans jeton');
  assert.equal((await call('GET', `/me/certificates/${S.cid}/link`, T('parent2'))).status, 404, 'un autre élève');
  assert.equal((await call('GET', `/me/certificates/${S.cid}/link`, T('outsider'))).status, 404);
  const other = await cert('orgadmin', { title: 'autre' });
  const tokenOfFirst = url.searchParams.get('t');
  assert.equal((await call('GET', `/files/certificates/${other.body.certificate.id}?t=${tokenOfFirst}`)).status, 403, 'jeton lié à UN certificat');
  assert.equal((await call('GET', `/orgs/${S.org}/certificates/${S.cid}/link`, T('teacher'))).status, 200);
  assert.equal((await call('GET', `/orgs/${S.org}/certificates/${S.cid}/link`, T('teacher2'))).status, 404, 'autre classe');
  assert.equal((await call('GET', `/orgs/${S.org}/certificates/${S.cid}/link`, T('parent'))).status, 403);
});

test('suppression d’un certificat : le fichier part aussi', async () => {
  const c = await cert('orgadmin', { title: 'à supprimer' });
  const path = `${certDir}/${S.org}/${c.body.certificate.id}`;
  await stat(path);
  assert.equal((await call('DELETE', `/orgs/${S.org}/certificates/${c.body.certificate.id}`, T('teacher'))).status, 403);
  assert.equal((await call('DELETE', `/orgs/${S.org}/certificates/${c.body.certificate.id}`, T('orgadmin'))).status, 200);
  await assert.rejects(stat(path), 'fichier supprimé du disque');
});

test('encouragements : message immédiat, cadeau annoncé seulement une fois remis (D18)', async () => {
  const before = (await notifs('parent')).notifications.length;
  assert.equal((await call('POST', stUrl('/rewards'), { ...T('parent'), body: { kind: 'message', title: 'x' } })).status, 403);
  assert.equal((await call('POST', stUrl('/rewards'), { ...T('teacher2'), body: { kind: 'message', title: 'x' } })).status, 404);
  const msg = await call('POST', stUrl('/rewards'), { ...T('teacher'), body: { kind: 'message', title: 'بارك الله فيك', body: 'استمر' } });
  assert.equal(msg.status, 200);
  assert.equal((await notifs('parent')).notifications.length, before + 1);
  const gift = await call('POST', stUrl('/rewards'), { ...T('teacher'), body: { kind: 'gift', title: 'مصحف هدية' } });
  assert.equal(gift.body.reward.giftStatus, 'to_give');
  assert.equal((await notifs('parent')).notifications.length, before + 1, 'cadeau pas encore remis : aucune surprise gâchée');
  let rw = (await call('GET', '/me/results', T('parent'))).body.organizations[0].rewards;
  assert.deepEqual(rw.map((r) => r.kind), ['message'], 'le cadeau à remettre reste invisible pour l’élève');
  assert.equal((await call('GET', stUrl('/results'), T('teacher'))).body.rewards.length, 2, 'mais l’équipe le voit');
  const given = await call('PATCH', `/orgs/${S.org}/rewards/${gift.body.reward.id}`, { ...T('teacher'), body: { given: true } });
  assert.equal(given.body.reward.giftStatus, 'given');
  const n = (await notifs('parent')).notifications[0];
  assert.deepEqual([n.kind, n.payload.rewardKind], ['reward', 'gift']);
  rw = (await call('GET', '/me/results', T('parent'))).body.organizations[0].rewards;
  assert.equal(rw.length, 2);
  assert.equal((await call('PATCH', `/orgs/${S.org}/rewards/${msg.body.reward.id}`, { ...T('teacher'), body: { given: true } })).status, 404, 'un message n’est pas un cadeau');
});

test('push : clé publique, adresses contrôlées, alerte envoyée aux appareils, abonnement expiré retiré', async () => {
  assert.equal((await call('GET', '/me/push/key', T('parent'))).body.publicKey, null, 'sans clés VAPID : alertes désactivées, pas d’erreur');
  const sub = (endpoint, k = 'parent') => call('POST', '/me/push/subscribe', { ...T(k), body: { endpoint, keys: { p256dh: 'BPk', auth: 'aut' } } });
  assert.equal((await sub('https://127.0.0.1/x')).body.error, 'invalid_endpoint');
  assert.equal((await sub('http://fcm.googleapis.com/x')).status, 400);
  assert.equal((await call('POST', '/me/push/subscribe', { body: { endpoint: 'https://fcm.googleapis.com/fcm/send/AAA', keys: { p256dh: 'k', auth: 'a' } } })).status, 401);
  assert.equal((await sub('https://fcm.googleapis.com/fcm/send/AAA')).status, 200);
  assert.equal((await sub('https://fcm.googleapis.com/fcm/send/AAA')).status, 200, 'idempotent');
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM push_subscriptions'))[0][0].n), 1);

  pushes.length = 0;
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(5, 7, 'acquired_error') } });
  assert.equal(pushes.length, 1, 'une alerte pour la page à reprendre');
  assert.match(pushes[0].title, /للإعادة.*reprendre/);
  const notifId = (await notifs('parent')).notifications[0].id;
  assert.equal(pushes[0].id, notifId, 'l’alerte porte la notification à ouvrir');
  assert.equal(pushes[0].url, `/app/?notif=${notifId}`);
  assert.equal(pushes[0].endpoint, 'https://fcm.googleapis.com/fcm/send/AAA');

  pushFails = 410; // l'abonnement a expiré côté navigateur
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(9, 9, 'review') } });
  pushFails = null;
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM push_subscriptions'))[0][0].n), 0, 'abonnement expiré supprimé');
  assert.ok((await notifs('parent')).unread >= 1, 'la notification dans l’app existe quand même');

  await sub('https://fcm.googleapis.com/fcm/send/BBB');
  assert.equal((await call('POST', '/me/push/unsubscribe', { ...T('parent'), body: { endpoint: 'https://fcm.googleapis.com/fcm/send/BBB' } })).status, 200);
  // Invocation de l'heure : désactivée par défaut, activable avec le décalage horaire de l'appareil.
  assert.deepEqual((await call('GET', '/me/push/dua', T('parent'))).body, { hourly: false, utcOffsetMinutes: 0 });
  assert.equal((await call('PUT', '/me/push/dua', { ...T('parent'), body: { hourly: true, utcOffsetMinutes: 60 } })).status, 200);
  assert.deepEqual((await call('GET', '/me/push/dua', T('parent'))).body, { hourly: true, utcOffsetMinutes: 60 });
  assert.equal((await call('PUT', '/me/push/dua', { ...T('parent'), body: { hourly: true, utcOffsetMinutes: 5000 } })).status, 400);
  assert.equal((await call('GET', '/me/push/dua')).status, 401);
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM push_subscriptions'))[0][0].n), 0);
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(5, 7, 'cleared') } });
});

test('push Android (FCM) : jeton enregistré, alerte envoyée, jeton périmé oublié', async () => {
  assert.equal((await call('GET', '/me/push/key', T('parent'))).body.native, true);
  const TOK = 'fcm-jeton-appareil-' + 'x'.repeat(140);
  const reg = (token, k = 'parent') => call('POST', '/me/push/fcm', { ...T(k), body: { token, platform: 'android' } });
  assert.equal((await call('POST', '/me/push/fcm', { body: { token: TOK } })).status, 401);
  assert.equal((await reg('court')).status, 400);
  assert.equal((await reg(TOK)).status, 200);
  assert.equal((await reg(TOK)).status, 200, 'idempotent');
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM fcm_tokens'))[0][0].n), 1);

  fcmPushes.length = 0;
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(5, 7, 'acquired_error') } });
  assert.equal(fcmPushes.length, 1, 'une alerte Android pour la page à reprendre');
  assert.equal(fcmPushes[0].token, TOK);
  assert.match(fcmPushes[0].title, /للإعادة.*reprendre/);
  assert.equal(fcmPushes[0].data.kind, 'retake_pages');
  assert.equal(fcmPushes[0].data.id, String((await notifs('parent')).notifications[0].id), 'données FCM : texte uniquement');

  fcmFails = { message: 'boom', statusCode: 500 }; // panne passagère : le jeton est gardé
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(9, 9, 'review') } });
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM fcm_tokens'))[0][0].n), 1);
  fcmFails = { statusCode: 404, unregistered: true }; // app désinstallée
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(10, 10, 'review') } });
  fcmFails = null;
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM fcm_tokens'))[0][0].n), 0, 'jeton périmé supprimé');

  await reg(TOK);
  assert.equal((await call('POST', '/me/push/fcm/remove', { ...T('parent'), body: { token: TOK } })).status, 200);
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM fcm_tokens'))[0][0].n), 0);
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { items: ayat(5, 7, 'cleared') } });
});

test('synthèse : cartes de mémorisation (604 pages, 114 sourates)', async () => {
  await call('PUT', stUrl('/validation'), { ...T('teacher'), body: { page: 3, result: 'acquired' } });
  const r = (await call('GET', stUrl('/summary'), T('teacher'))).body;
  assert.equal(r.pages.length, 604);
  assert.equal(r.surahs.length, 114);
  assert.equal(r.pages[2], 'c', 'page 3 complète');
  assert.equal(r.pages[0], 'n');
  assert.equal(r.surahs[1], 'p', 'Al-Baqara : en cours');
  assert.match(r.pages, /^[ncpr]+$/);
});

test('classement : par classe/établissement, rang à égalité, élite, période, portée de l’enseignant (D7)', async () => {
  // A : Al-Fatiha entière + page 3 ; B : quelques ayat ; C : rien.
  await call('PUT', `/orgs/${S.org}/students/${S.pid}/validation`, { ...T('teacher'), body: { items: ayat(1, 7, 'acquired').map((i) => ({ ...i, surah: 1 })) } });
  await call('PUT', stUrl('/validation').replace(S.pid, S.pidB), { ...T('orgadmin'), body: { items: ayat(5, 8, 'acquired') } });
  const r = await call('GET', `/orgs/${S.org}/reports/ranking?period=all`, T('orgadmin'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rows = r.body.rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((x) => x.fullName), ['أحمد الأول', 'بلال الثاني', 'جمال الثالث'], 'classés : suite de sourates, puis ayat');
  assert.deepEqual(rows.map((x) => x.rank), [1, 2, 3]);
  const a = rows[0];
  assert.equal(a.surahs.complete, 1);
  assert.ok(a.surahs.longestRun <= a.surahs.complete && a.ahzab.longestRun <= a.ahzab.complete);
  assert.equal(a.elite, true, 'tête du classement = élite');
  assert.equal(rows[2].elite, false);
  assert.ok(a.gain >= 18 && a.perWeek > 0, 'gain de la période et rythme par semaine');
  assert.ok(a.lastValidationAt);
  assert.deepEqual(a.classes, ['فوج 1']);
  for (const p of ['month', 'quarter', 'semester', 'year']) assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking?period=${p}`, T('orgadmin'))).body.rows[0].gain, a.gain, p);
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking?period=jamais`, T('orgadmin'))).status, 400);
  // Ex æquo : même rang.
  await call('PUT', stUrl('/validation').replace(S.pid, S.pidC), { ...T('orgadmin'), body: { items: ayat(5, 8, 'acquired') } });
  const tie = (await call('GET', `/orgs/${S.org}/reports/ranking`, T('orgadmin'))).body.rows;
  assert.equal(tie.find((x) => x.studentId === S.pidB).rank, tie.find((x) => x.studentId === S.pidC).rank, 'ex æquo = même rang');
  // Portée : l'enseignant voit ses classes ; les autres rien ; élèves et parents jamais.
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking`, T('teacher'))).body.rows.length, 3);
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking`, T('teacher2'))).body.rows.length, 0);
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking`, T('parent'))).status, 403, 'classement : équipe seulement');
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking`, T('outsider'))).status, 404);
  assert.equal((await call('GET', `/orgs/${S.org}/reports/ranking?groupId=${S.cls}`, T('orgadmin'))).body.rows.length, 3);
});

test('rythme : ayat validés par semaine, semaine en cours à droite', async () => {
  const r = await call('GET', stUrl('/rhythm?weeks=8'), T('teacher'));
  assert.equal(r.status, 200);
  assert.equal(r.body.weeks.length, 8);
  assert.ok(r.body.weeks.at(-1).ayat >= 18, 'les validations du jour sont dans la dernière semaine');
  assert.ok(r.body.weeks.slice(0, 7).every((w) => w.ayat === 0));
  assert.equal((await call('GET', stUrl('/rhythm?weeks=99'), T('teacher'))).status, 400);
  assert.equal((await call('GET', stUrl('/rhythm'), T('teacher2'))).status, 404);
});

test('purge définitive d’un élève : ses fichiers de certificats sont supprimés (D20)', async () => {
  const c = await cert('orgadmin', { title: 'pour la purge' }, S.org, S.pidB);
  const path = `${certDir}/${S.org}/${c.body.certificate.id}`;
  await stat(path);
  await call('POST', `/orgs/${S.org}/students/${S.pidB}/leave`, { ...T('orgadmin'), body: {} });
  await pool.query("UPDATE student_profiles SET retain_until = '2020-01-01' WHERE id = ?", [S.pidB]);
  assert.equal((await call('DELETE', `/orgs/${S.org}/students/${S.pidB}`, T('admin'))).status, 200);
  await assert.rejects(stat(path), 'plus de fichier orphelin');
  assert.ok((await readdir(`${certDir}/${S.org}`)).length >= 1, 'les autres élèves ne sont pas touchés');
});
