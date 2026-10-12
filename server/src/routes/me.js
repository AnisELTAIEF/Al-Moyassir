import { publicUser } from '../users.js';
import { progressOf, upsertProgress, progressItemSchema } from '../progress.js';

export default async function meRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (req) => publicUser(req.user));

  app.patch('/', {
    schema: { body: { type: 'object', required: ['displayName'], properties: { displayName: { type: 'string', minLength: 2, maxLength: 80 } } } },
  }, async (req) => {
    await app.db.query('UPDATE users SET display_name = ? WHERE id = ?', [req.body.displayName.trim(), req.user.id]);
    return { ...publicUser(req.user), displayName: req.body.displayName.trim() };
  });

  app.get('/progress', async (req) => ({ items: await progressOf(app.db, req.user.id) }));

  app.put('/progress', {
    schema: { body: { type: 'object', required: ['items'], properties: {
      items: { type: 'array', maxItems: 7000, items: progressItemSchema },
    } } },
  }, async (req) => {
    await upsertProgress(app.db, app.ayahCounts, req.user.id, req.body.items);
    return { ok: true };
  });

  app.post('/progress/delete', {
    schema: { body: { type: 'object', required: ['keys'], properties: {
      keys: { type: 'array', maxItems: 7000, items: { type: 'object', required: ['surah', 'ayah'], properties: {
        surah: { type: 'integer' }, ayah: { type: 'integer' } } } },
    } } },
  }, async (req) => {
    if (req.body.keys.length) {
      await app.db.query('DELETE FROM memorized_ayahs WHERE user_id = ? AND (surah, ayah) IN (?)',
        [req.user.id, req.body.keys.map((k) => [k.surah, k.ayah])]);
    }
    return { ok: true };
  });

  /** Marque (ou retire) toute une sourate d'un coup. status = null pour retirer. */
  app.put('/progress/surah/:n', {
    schema: {
      params: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 114 } } },
      body: { type: 'object', required: ['status'], properties: { status: { type: ['string', 'null'], enum: ['learning', 'memorized', null] } } },
    },
  }, async (req) => {
    const n = req.params.n;
    const count = app.ayahCounts.get(n);
    if (req.body.status === null) {
      await app.db.query('DELETE FROM memorized_ayahs WHERE user_id = ? AND surah = ?', [req.user.id, n]);
    } else {
      const now = new Date().toISOString();
      const items = Array.from({ length: count }, (_, i) => ({ surah: n, ayah: i + 1, status: req.body.status, updatedAt: now }));
      // Conserve la date de mémorisation et les révisions déjà enregistrées.
      const [existing] = await app.db.query(
        'SELECT ayah, memorized_at, last_reviewed_at, review_count FROM memorized_ayahs WHERE user_id = ? AND surah = ?', [req.user.id, n]);
      const prev = new Map(existing.map((r) => [Number(r.ayah), r]));
      for (const it of items) {
        const p = prev.get(it.ayah);
        if (p) {
          it.memorizedAt = p.memorized_at?.toISOString() ?? null;
          it.lastReviewedAt = p.last_reviewed_at?.toISOString() ?? null;
          it.reviewCount = Number(p.review_count);
        }
      }
      await upsertProgress(app.db, app.ayahCounts, req.user.id, items);
    }
    return { ok: true, surah: n, ayahs: count };
  });

  app.get('/groups', async (req) => {
    const [rows] = await app.db.query(
      `SELECT g.id, g.name, gm.role, (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members
       FROM group_members gm JOIN study_groups g ON g.id = gm.group_id
       WHERE gm.user_id = ? ORDER BY g.name`, [req.user.id]);
    return { items: rows.map((r) => ({ id: r.id, name: r.name, role: r.role, members: Number(r.members) })) };
  });
}
