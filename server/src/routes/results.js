// Résultats d'examens et de concours, certificats (D9) et récompenses des élèves d'élite (D18).
//   - L'ADMINISTRATIF téléverse les certificats et saisit les résultats ; l'enseignant peut encourager (message, cadeau).
//   - L'élève est notifié ; il garde l'historique de tous ses certificats. Les cadeaux ne lui sont montrés qu'une fois remis.
//   - Un certificat est un fichier PDF/PNG/JPEG ≤ 5 Mo : type vérifié sur le contenu, stocké hors base, servi par un lien de 5 min.
import { createReadStream, existsSync } from 'node:fs';
import { HttpError } from '../errors.js';
import { uuid } from '../security.js';
import { iso } from '../users.js';
import { orgAccessFor } from '../orgAccess.js';
import { addNotification, pushNotification } from '../notify.js';
import { MAX_CERT_BYTES, sniffMime, safeFileName, saveCertificate, removeCertificate, certPath, signFileToken, verifyFileToken } from '../certFiles.js';

const id36 = { type: 'string', minLength: 36, maxLength: 36 };
const P = (...keys) => ({ type: 'object', properties: Object.fromEntries(keys.map((k) => [k, id36])) });
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const validDay = (s) => {
  if (Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw new HttpError(400, 'invalid_date', 'Date invalide.');
  return s;
};

const asmDto = (r) => ({ id: r.id, kind: r.kind, title: r.title, heldOn: r.held_on, score: r.score, rank: r.rank_text });
const certDto = (r) => ({ id: r.id, title: r.title, issuedOn: r.issued_on, fileName: r.file_name, mime: r.mime, size: Number(r.size_bytes), assessmentId: r.assessment_id });
const rewardDto = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, giftStatus: r.gift_status, givenOn: r.given_on, createdAt: iso(r.created_at) });

const ASM = "id, kind, title, DATE_FORMAT(held_on, '%Y-%m-%d') AS held_on, score, rank_text";
const CERT = "id, assessment_id, title, DATE_FORMAT(issued_on, '%Y-%m-%d') AS issued_on, file_name, mime, size_bytes";
const RW = "id, kind, title, body, gift_status, DATE_FORMAT(given_on, '%Y-%m-%d') AS given_on, created_at";

export default async function resultsRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;
  const { access, studentOf } = orgAccessFor(app);

  async function notifyStudent(profile, org, kind, title, body, extra) {
    if (!profile.user_id) return;
    const payload = { organizationId: org.id, organizationName: org.name, ...extra };
    const id = await addNotification(db, profile.user_id, { kind, title, body, payload });
    await pushNotification(app, profile.user_id, { kind, payload, id });
  }

  // Tout ce qui concerne un élève, pour l'équipe : résultats, certificats, récompenses.
  app.get('/:id/students/:pid/results', { schema: { params: P('id', 'pid') } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    const [a] = await db.query(`SELECT ${ASM} FROM assessments WHERE profile_id = ? ORDER BY held_on DESC`, [st.id]);
    const [c] = await db.query(`SELECT ${CERT} FROM certificates WHERE profile_id = ? ORDER BY issued_on DESC`, [st.id]);
    const [r] = await db.query(`SELECT ${RW} FROM rewards WHERE profile_id = ? ORDER BY created_at DESC`, [st.id]);
    return { assessments: a.map(asmDto), certificates: c.map(certDto), rewards: r.map(rewardDto) };
  });

  // ── Examens et concours ──
  app.post('/:id/students/:pid/assessments', {
    schema: {
      params: P('id', 'pid'),
      body: {
        type: 'object',
        required: ['kind', 'title', 'heldOn'],
        properties: { kind: { enum: ['exam', 'competition'] }, title: { type: 'string', minLength: 1, maxLength: 160 }, heldOn: day, score: { type: 'string', maxLength: 40 }, rank: { type: 'string', maxLength: 40 } },
      },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const st = await studentOf(req, ctx, req.params.pid);
    const b = req.body;
    const aid = uuid();
    await db.query('INSERT INTO assessments (id, organization_id, profile_id, kind, title, held_on, score, rank_text, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [aid, ctx.org.id, st.id, b.kind, b.title.trim(), validDay(b.heldOn), b.score?.trim() || null, b.rank?.trim() || null, req.user.id]);
    const [[row]] = await db.query(`SELECT ${ASM} FROM assessments WHERE id = ?`, [aid]);
    return { assessment: asmDto(row) };
  });

  app.delete('/:id/assessments/:aid', { schema: { params: P('id', 'aid') } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    await db.query('DELETE FROM assessments WHERE id = ? AND organization_id = ?', [req.params.aid, ctx.org.id]);
    return { ok: true };
  });

  // ── Certificats (fichier envoyé en base64 : évite une dépendance de plus ; ≤ 5 Mo, ≈ 6,7 Mo en base64) ──
  app.post('/:id/students/:pid/certificates', {
    bodyLimit: 8 * 1024 * 1024,
    schema: {
      params: P('id', 'pid'),
      body: {
        type: 'object',
        required: ['title', 'issuedOn', 'fileName', 'dataBase64'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 }, issuedOn: day, assessmentId: id36,
          fileName: { type: 'string', maxLength: 200 }, dataBase64: { type: 'string', maxLength: 7_400_000 },
        },
      },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const st = await studentOf(req, ctx, req.params.pid);
    const b = req.body;
    const buf = Buffer.from(b.dataBase64, 'base64');
    if (buf.length === 0 || buf.length > MAX_CERT_BYTES) throw new HttpError(400, 'invalid_file', 'Fichier vide ou trop volumineux (5 Mo au maximum).');
    const mime = sniffMime(buf);
    if (!mime) throw new HttpError(400, 'invalid_file', 'Format non accepté : envoyez un PDF, un PNG ou un JPEG.');
    if (b.assessmentId) {
      const [[ok]] = await db.query('SELECT 1 AS x FROM assessments WHERE id = ? AND profile_id = ?', [b.assessmentId, st.id]);
      if (!ok) throw new HttpError(400, 'invalid_assessment', 'Ce résultat n’appartient pas à cet élève.');
    }
    const cid = uuid();
    await saveCertificate(app.cfg, ctx.org.id, cid, buf);
    try {
      await db.query(
        'INSERT INTO certificates (id, organization_id, profile_id, assessment_id, title, issued_on, file_name, mime, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [cid, ctx.org.id, st.id, b.assessmentId ?? null, b.title.trim(), validDay(b.issuedOn), safeFileName(b.fileName), mime, buf.length, req.user.id]);
    } catch (e) {
      await removeCertificate(app.cfg, ctx.org.id, cid); // pas de fichier orphelin
      throw e;
    }
    await notifyStudent(st, ctx.org, 'certificate', 'Nouveau certificat', b.title.trim(), { title: b.title.trim(), certificateId: cid });
    const [[row]] = await db.query(`SELECT ${CERT} FROM certificates WHERE id = ?`, [cid]);
    return { certificate: certDto(row) };
  });

  app.delete('/:id/certificates/:cid', { schema: { params: P('id', 'cid') } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    const [[c]] = await db.query('SELECT id FROM certificates WHERE id = ? AND organization_id = ?', [req.params.cid, ctx.org.id]);
    if (!c) throw new HttpError(404, 'not_found', 'Certificat introuvable.');
    await db.query('DELETE FROM certificates WHERE id = ?', [c.id]);
    await removeCertificate(app.cfg, ctx.org.id, c.id);
    return { ok: true };
  });

  // Lien de téléchargement (5 min) pour l'équipe, avec la même portée que la fiche de l'élève.
  app.get('/:id/certificates/:cid/link', { schema: { params: P('id', 'cid') } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const [[c]] = await db.query('SELECT id, profile_id FROM certificates WHERE id = ? AND organization_id = ?', [req.params.cid, ctx.org.id]);
    if (!c) throw new HttpError(404, 'not_found', 'Certificat introuvable.');
    await studentOf(req, ctx, c.profile_id);
    return { url: `${app.cfg.publicUrl}/api/files/certificates/${c.id}?t=${await signFileToken(app.cfg, c.id)}` };
  });

  // ── Récompenses : message d'encouragement et cadeau (le certificat passe par /certificates) ──
  app.post('/:id/students/:pid/rewards', {
    schema: {
      params: P('id', 'pid'),
      body: { type: 'object', required: ['kind', 'title'], properties: { kind: { enum: ['message', 'gift'] }, title: { type: 'string', minLength: 1, maxLength: 160 }, body: { type: 'string', maxLength: 400 } } },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    const { kind, title, body = '' } = req.body;
    const rid = uuid();
    await db.query('INSERT INTO rewards (id, organization_id, profile_id, kind, title, body, gift_status, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [rid, ctx.org.id, st.id, kind, title.trim(), body.trim(), kind === 'gift' ? 'to_give' : null, req.user.id]);
    // Un message part tout de suite ; un cadeau n'est annoncé qu'une fois remis (pas de surprise gâchée).
    if (kind === 'message') await notifyStudent(st, ctx.org, 'reward', 'Message d’encouragement', title.trim(), { rewardKind: 'message', title: title.trim(), body: body.trim() });
    const [[row]] = await db.query(`SELECT ${RW} FROM rewards WHERE id = ?`, [rid]);
    return { reward: rewardDto(row) };
  });

  app.patch('/:id/rewards/:rid', {
    schema: { params: P('id', 'rid'), body: { type: 'object', required: ['given'], properties: { given: { type: 'boolean' } } } },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const [[r]] = await db.query("SELECT id, profile_id, title, kind, gift_status FROM rewards WHERE id = ? AND organization_id = ? AND kind = 'gift'", [req.params.rid, ctx.org.id]);
    if (!r) throw new HttpError(404, 'not_found', 'Cadeau introuvable.');
    const st = await studentOf(req, ctx, r.profile_id);
    const given = req.body.given;
    await db.query('UPDATE rewards SET gift_status = ?, given_on = ? WHERE id = ?', [given ? 'given' : 'to_give', given ? new Date().toISOString().slice(0, 10) : null, r.id]);
    if (given && r.gift_status !== 'given') await notifyStudent(st, ctx.org, 'reward', 'Cadeau remis', r.title, { rewardKind: 'gift', title: r.title });
    const [[row]] = await db.query(`SELECT ${RW} FROM rewards WHERE id = ?`, [r.id]);
    return { reward: rewardDto(row) };
  });

  app.delete('/:id/rewards/:rid', { schema: { params: P('id', 'rid') } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin']);
    await db.query('DELETE FROM rewards WHERE id = ? AND organization_id = ?', [req.params.rid, ctx.org.id]);
    return { ok: true };
  });
}

/** Routes de l'élève (ou de son parent), sous /me. */
export async function myResultsRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;

  app.get('/results', async (req) => {
    const [profiles] = await db.query(
      `SELECT p.id, p.organization_id, o.name FROM student_profiles p JOIN organizations o ON o.id = p.organization_id
       WHERE p.user_id = ? AND p.status = 'active' ORDER BY o.name`, [req.user.id]);
    const organizations = [];
    for (const p of profiles) {
      const [a] = await db.query(`SELECT ${ASM} FROM assessments WHERE profile_id = ? ORDER BY held_on DESC`, [p.id]);
      const [c] = await db.query(`SELECT ${CERT} FROM certificates WHERE profile_id = ? ORDER BY issued_on DESC`, [p.id]);
      const [r] = await db.query(`SELECT ${RW} FROM rewards WHERE profile_id = ? AND (kind = 'message' OR gift_status = 'given') ORDER BY created_at DESC`, [p.id]);
      organizations.push({ organizationId: p.organization_id, organizationName: p.name, assessments: a.map(asmDto), certificates: c.map(certDto), rewards: r.map(rewardDto) });
    }
    return { organizations };
  });

  app.get('/certificates/:cid/link', { schema: { params: P('cid') } }, async (req) => {
    const [[c]] = await db.query(
      `SELECT c.id FROM certificates c JOIN student_profiles p ON p.id = c.profile_id WHERE c.id = ? AND p.user_id = ?`, [req.params.cid, req.user.id]);
    if (!c) throw new HttpError(404, 'not_found', 'Certificat introuvable.');
    return { url: `${app.cfg.publicUrl}/api/files/certificates/${c.id}?t=${await signFileToken(app.cfg, c.id)}` };
  });
}

/** Téléchargement par lien signé (sans en-tête d'authentification : s'ouvre dans le navigateur). */
export async function certificateFileRoutes(app) {
  app.get('/files/certificates/:cid', {
    schema: { params: P('cid'), querystring: { type: 'object', required: ['t'], properties: { t: { type: 'string', maxLength: 1000 } } } },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!(await verifyFileToken(app.cfg, req.query.t, req.params.cid))) throw new HttpError(403, 'invalid_link', 'Lien invalide ou expiré.');
    const [[c]] = await app.db.query('SELECT id, organization_id, file_name, mime, size_bytes FROM certificates WHERE id = ?', [req.params.cid]);
    const file = c && certPath(app.cfg, c.organization_id, c.id);
    if (!c || !existsSync(file)) throw new HttpError(404, 'not_found', 'Fichier introuvable.');
    reply
      .type(c.mime)
      .header('Content-Length', c.size_bytes)
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(c.file_name)}`)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff');
    return reply.send(createReadStream(file));
  });
}
