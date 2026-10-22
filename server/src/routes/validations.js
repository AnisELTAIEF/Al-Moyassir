// Validation de la mémorisation par l'enseignant (lot C) et notifications de l'élève.
//
//   - L'ENSEIGNANT (ou l'administratif) pose, ayah par ayah ou page par page : acquis / acquis avec erreur / à revoir.
//   - Cette validation est la seule source des rapports (D2). Elle ne touche JAMAIS à memorized_ayahs, l'auto-marquage
//     privé de l'élève (D15) : ces deux couches restent indépendantes.
//   - Règle de page (D4) : au moins `error_threshold` ayat « acquis avec erreur » sur la même page → page à reprendre.
//   - Plusieurs établissements (D5/D19) : chacun ne compte que SES validations ; l'élève voit la plus récente par ayah.
import { standingOf } from '../standing.js';
import { HttpError } from '../errors.js';
import { tx } from '../db.js';
import { iso } from '../users.js';
import { orgAccessFor } from '../orgAccess.js';
import { RESULT_CODE, passagesOf, retakePages, acquiredFlags, memorizationStats, coverageMaps } from '../reports.js';
import { addNotification, pushNotification } from '../notify.js';

const idPid = { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 }, pid: { type: 'string', minLength: 36, maxLength: 36 } } };
const RESULTS = ['acquired', 'acquired_error', 'review', 'cleared'];
const dayStr = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const rangeItem = {
  type: 'object',
  required: ['surah', 'from', 'to'],
  properties: { surah: { type: 'integer', minimum: 1, maximum: 114 }, from: { type: 'integer', minimum: 1 }, to: { type: 'integer', minimum: 1 } },
};

const putSchema = {
  params: idPid,
  body: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 700,
        items: {
          type: 'object',
          required: ['surah', 'ayah', 'result'],
          properties: { surah: { type: 'integer', minimum: 1, maximum: 114 }, ayah: { type: 'integer', minimum: 1 }, result: { enum: RESULTS } },
        },
      },
      page: { type: 'integer', minimum: 1, maximum: 604 },
      pages: { type: 'array', maxItems: 604, items: { type: 'integer', minimum: 1, maximum: 604 } },
      ranges: { type: 'array', maxItems: 200, items: rangeItem },
      result: { enum: RESULTS },
      at: dayStr,
    },
  },
};

const bulkSchema = {
  params: { type: 'object', properties: { id: { type: 'string', minLength: 36, maxLength: 36 } } },
  body: {
    type: 'object',
    required: ['studentIds'],
    properties: {
      studentIds: { type: 'array', minItems: 1, maxItems: 200, items: { type: 'string', minLength: 36, maxLength: 36 } },
      items: putSchema.body.properties.items,
      page: putSchema.body.properties.page,
      pages: putSchema.body.properties.pages,
      ranges: putSchema.body.properties.ranges,
      result: putSchema.body.properties.result,
      at: dayStr,
    },
  },
};

/** Résultats posés (ayah → code), pour un élève dans UN établissement. */
async function loadStates(db, ref, orgId, profileId) {
  const [rows] = await db.query(
    'SELECT surah, ayah, result, updated_at FROM validation_state WHERE organization_id = ? AND profile_id = ?', [orgId, profileId]);
  const codes = new Uint8Array(ref.total);
  const items = [];
  for (const r of rows) {
    codes[ref.indexOf(r.surah, r.ayah)] = RESULT_CODE[r.result];
    items.push({ surah: r.surah, ayah: r.ayah, result: r.result, at: iso(r.updated_at) });
  }
  return { codes, items };
}

const stateDto = (ref, codes, items, threshold) => ({
  items,
  retakePages: retakePages(ref, codes, threshold),
  threshold,
  stats: memorizationStats(ref, acquiredFlags(ref, codes, threshold)),
});

/** Les ayat visés (indices globaux → résultat) à partir de « page », « pages », « ranges » ou « items ». */
function wantedFrom(ref, { page, pages, ranges, items, result }) {
  const wanted = new Map();
  const needResult = () => { if (!result) throw new HttpError(400, 'invalid_request', 'Indiquez le résultat à appliquer.'); };
  if (page != null || pages?.length) {
    needResult();
    for (const p of page != null ? [page] : pages) {
      const { from, to } = ref.pageRanges[p - 1];
      for (let i = from; i < to; i++) wanted.set(i, result);
    }
  }
  if (ranges?.length) {
    needResult();
    for (const r of ranges) {
      let a, b;
      try { a = ref.indexOf(r.surah, r.from); b = ref.indexOf(r.surah, r.to); } catch { throw new HttpError(400, 'invalid_ayah', `Passage inexistant : ${r.surah}:${r.from}-${r.to}.`); }
      if (b < a) throw new HttpError(400, 'invalid_ayah', `Passage inversé : ${r.surah}:${r.from}-${r.to}.`);
      for (let i = a; i <= b; i++) wanted.set(i, result);
    }
  }
  if (items?.length) {
    for (const it of items) {
      let idx;
      try { idx = ref.indexOf(it.surah, it.ayah); } catch { throw new HttpError(400, 'invalid_ayah', `Ayah inexistant : ${it.surah}:${it.ayah}.`); }
      wanted.set(idx, it.result);
    }
  }
  if (!wanted.size) throw new HttpError(400, 'invalid_request', 'Rien à valider : fournissez « items », « page(s) » ou « ranges » et « result ».');
  return wanted;
}

/**
 * Applique une validation à un élève (journal + état + notification). `at` (AAAA-MM-JJ) : saisie d'un hifdh
 * déjà validé sur papier, datée du jour réel de la validation ; sans alerte à l'élève.
 */
async function applyValidation(app, ctx, st, body, userId) {
  const db = app.db;
  const ref = app.reference;
  if (st.status !== 'active') throw new HttpError(409, 'student_left', 'Cet élève est sorti de l’établissement.');
  const at = body.at ? new Date(`${body.at}T12:00:00Z`) : null;
  if (body.at && (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== body.at || at > new Date())) throw new HttpError(400, 'invalid_date', 'Date de validation invalide (pas dans le futur).');
  if (at && !ctx.seesAll) throw new HttpError(403, 'forbidden', 'Seul l’administratif peut saisir un hifdh validé sur papier (avec une date).');
  const threshold = Number(ctx.org.error_threshold);
  const wanted = wantedFrom(ref, body);
  // 2. On ne garde que ce qui change vraiment (pas de bruit dans le journal).
  const { codes } = await loadStates(db, ref, ctx.org.id, st.id);
  const before = new Set(retakePages(ref, codes, threshold));
  const next = Uint8Array.from(codes);
  const effective = [];
  for (const [idx, res] of wanted) {
    const code = res === 'cleared' ? 0 : RESULT_CODE[res];
    if (next[idx] === code) continue;
    next[idx] = code;
    effective.push({ idx, code, res });
  }
  const after = retakePages(ref, next, threshold);
  if (!effective.length) return { changed: 0, retakePages: after, threshold };

  // 3. Journal + état, en une transaction.
  const sent = [];
  await tx(db, async (c) => {
    const journal = effective.map((e) => { const [s, a] = ref.refAt(e.idx); return [ctx.org.id, st.id, userId, s, a, e.res, at ?? new Date()]; });
    await c.query('INSERT INTO validations (organization_id, profile_id, teacher_id, surah, ayah, result, created_at) VALUES ?', [journal]);
    const set = effective.filter((e) => e.code !== 0).map((e) => { const [s, a] = ref.refAt(e.idx); return [ctx.org.id, st.id, s, a, e.res, userId, at ?? new Date()]; });
    if (set.length) {
      await c.query(
        `INSERT INTO validation_state (organization_id, profile_id, surah, ayah, result, teacher_id, updated_at)
         VALUES ${set.map(() => '(?,?,?,?,?,?,?)').join(',')}
         ON DUPLICATE KEY UPDATE result = VALUES(result), teacher_id = VALUES(teacher_id), updated_at = VALUES(updated_at)`,
        set.flat());
    }
    for (const e of effective.filter((x) => x.code === 0)) {
      const [s, a] = ref.refAt(e.idx);
      await c.query('DELETE FROM validation_state WHERE organization_id = ? AND profile_id = ? AND surah = ? AND ayah = ?', [ctx.org.id, st.id, s, a]);
    }

    // 4. Notification à l'élève (s'il a un compte lié) : pages qui basculent « à reprendre », ayat à revoir.
    if (st.user_id && !at) {
      const newlyRetake = after.filter((p) => !before.has(p));
      const reviewIdx = effective.filter((e) => e.code === 3).map((e) => e.idx);
      const name = (s) => ref.surahNames?.get(s) ?? String(s);
      const span = (x) => (x.from === x.to ? `${x.from}` : `${x.from}–${x.to}`);
      const note = async (kind, title, body, extra) => {
        const payload = { organizationId: ctx.org.id, organizationName: ctx.org.name, ...extra };
        const id = await addNotification(c, st.user_id, { kind, title, body, payload });
        sent.push({ kind, payload, id });
      };
      if (newlyRetake.length) {
        // Sourate du début de chaque page, pour que l'élève s'y retrouve sans connaître les numéros de page.
        const pageInfo = newlyRetake.map((p) => { const [s, a] = ref.refAt(ref.pageRanges[p - 1].from); return { page: p, surah: s, ayah: a, name: name(s) }; });
        const txt = pageInfo.map((x) => `${x.page} (${x.name})`).join(', ');
        await note('retake_pages', 'Page à reprendre', `Page(s) à reprendre : ${txt} (${ctx.org.name}).`, { pages: newlyRetake, pageInfo });
      }
      if (reviewIdx.length) {
        const refs = passagesOf(ref, reviewIdx).map((x) => ({ ...x, name: name(x.surah) }));
        const txt = refs.map((x) => `${x.name} ${span(x)}`).join(' · ');
        await note('review_ayat', 'Ayat à revoir', `${reviewIdx.length} ayat à revoir : ${txt} (${ctx.org.name}).`, { count: reviewIdx.length, refs });
      }
    }
  });
  // 5. Alerte sur les appareils de l'élève, une fois la transaction validée (n'échoue jamais).
  for (const n of sent) await pushNotification(app, st.user_id, n);
  return { changed: effective.length, retakePages: after, threshold };
}

/** Routes de l'équipe, sous /orgs. */
export default async function validationRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;
  const ref = app.reference;
  const { access, studentOf } = orgAccessFor(app);

  // Ce que l'enseignant a déjà validé pour cet élève (jamais ses marques personnelles).
  app.get('/:id/students/:pid/validation', { schema: { params: idPid } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    const { codes, items } = await loadStates(db, ref, ctx.org.id, st.id);
    return stateDto(ref, codes, items, Number(ctx.org.error_threshold));
  });

  // Synthèse sans le détail : حفظ إجمالي / مسترسل en ahzab et en sourates entiers (D1), pages à reprendre.
  app.get('/:id/students/:pid/summary', { schema: { params: idPid } }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    const { codes, items } = await loadStates(db, ref, ctx.org.id, st.id);
    const { stats, retakePages: retake, threshold } = stateDto(ref, codes, items, Number(ctx.org.error_threshold));
    return { stats, retakePages: retake, threshold, validatedAyat: items.length, ...coverageMaps(ref, codes, threshold) };
  });

  app.put('/:id/students/:pid/validation', { schema: putSchema }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    return applyValidation(app, ctx, st, req.body, req.user.id);
  });

  // Plusieurs élèves d'un coup (même classe) : mêmes pages / passages pour tous ceux qui sont cochés.
  app.post('/:id/validation/bulk', { schema: bulkSchema }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const ids = [...new Set(req.body.studentIds)];
    const { studentIds, ...rest } = req.body;
    const out = [];
    for (const pid of ids) {
      try {
        const st = await studentOf(req, ctx, pid);
        const r = await applyValidation(app, ctx, st, rest, req.user.id);
        out.push({ studentId: pid, name: st.full_name, changed: r.changed });
      } catch (e) {
        out.push({ studentId: pid, error: e instanceof HttpError ? e.message : 'Erreur inattendue.' });
        if (!(e instanceof HttpError)) app.log.error(e);
      }
    }
    return { results: out, changed: out.filter((x) => x.changed > 0).length, errors: out.filter((x) => x.error).length };
  });
}

/** Routes de l'élève (ou de son parent), sous /me : ses validations et ses notifications. */
export async function myValidationRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;
  const ref = app.reference;

  // Un bloc par établissement qui suit cet élève (D5) ; l'app garde, pour chaque ayah, la validation la plus récente (D19).
  app.get('/validations', async (req) => {
    const [profiles] = await db.query(
      `SELECT p.id, p.organization_id, p.full_name, o.name, o.error_threshold
       FROM student_profiles p JOIN organizations o ON o.id = p.organization_id
       WHERE p.user_id = ? AND p.status = 'active' ORDER BY o.name`, [req.user.id]);
    const organizations = [];
    for (const p of profiles) {
      const { codes, items } = await loadStates(db, ref, p.organization_id, p.id);
      organizations.push({
        organizationId: p.organization_id,
        organizationName: p.name,
        profileId: p.id,
        studentName: p.full_name,
        items,
        retakePages: retakePages(ref, codes, Number(p.error_threshold)),
        threshold: Number(p.error_threshold),
        // Sa position seulement (jamais les noms ni les résultats des autres élèves).
        standing: await standingOf(db, ref, { id: p.organization_id, error_threshold: p.error_threshold }, p.id),
      });
    }
    return { organizations };
  });

  app.get('/notifications', async (req) => {
    const [rows] = await db.query(
      'SELECT id, kind, title, body, payload, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
    const [[u]] = await db.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    return {
      unread: Number(u.n),
      notifications: rows.map((r) => ({
        id: Number(r.id),
        kind: r.kind,
        title: r.title,
        body: r.body,
        payload: r.payload ? JSON.parse(r.payload) : null,
        createdAt: iso(r.created_at),
        read: !!r.read_at,
      })),
    };
  });

  app.post('/notifications/read', {
    schema: { body: { type: 'object', properties: { ids: { type: 'array', maxItems: 200, items: { type: 'integer' } } } } },
  }, async (req) => {
    const ids = req.body?.ids;
    if (ids?.length) await db.query('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL AND id IN (?)', [req.user.id, ids]);
    else await db.query('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
    return { ok: true };
  });
}

