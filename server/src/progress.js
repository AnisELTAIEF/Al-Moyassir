import { HttpError } from './errors.js';
import { iso } from './users.js';

export const progressRow = (r) => ({
  surah: Number(r.surah),
  ayah: Number(r.ayah),
  status: r.status,
  memorizedAt: iso(r.memorized_at),
  lastReviewedAt: iso(r.last_reviewed_at),
  reviewCount: Number(r.review_count),
  needsReview: Boolean(Number(r.needs_review ?? 0)),
  updatedAt: iso(r.updated_at),
});

export async function progressOf(db, userId) {
  const [rows] = await db.query('SELECT * FROM memorized_ayahs WHERE user_id = ? ORDER BY surah, ayah', [userId]);
  return rows.map(progressRow);
}

export function checkAyah(ayahCounts, surah, ayah) {
  const max = ayahCounts.get(surah);
  if (!max || ayah < 1 || ayah > max) throw new HttpError(400, 'invalid_ayah', `Ayah ${surah}:${ayah} inexistant.`);
}

const date = (v) => (v ? new Date(v) : null);

/**
 * Enregistre une liste d'ayat. Dernière écriture gagnante : une ligne n'est remplacée
 * que si `updatedAt` reçu est plus récent ou égal à celui en base.
 */
export async function upsertProgress(db, ayahCounts, userId, items) {
  if (!items.length) return 0;
  for (const it of items) checkAyah(ayahCounts, it.surah, it.ayah);
  // Les clients antérieurs à la 0.7.0 n'envoient pas `needsReview` : leurs écritures ne
  // touchent pas la colonne (valeur conservée, ou 0 par défaut pour une nouvelle ligne).
  const withFlag = items.filter((it) => typeof it.needsReview === 'boolean');
  const withoutFlag = items.filter((it) => typeof it.needsReview !== 'boolean');
  let affected = 0;
  if (withoutFlag.length) affected += await upsertRows(db, userId, withoutFlag, false);
  if (withFlag.length) affected += await upsertRows(db, userId, withFlag, true);
  return affected;
}

async function upsertRows(db, userId, items, withFlag) {
  const now = new Date();
  const values = items.map((it) => [
    userId, it.surah, it.ayah, it.status,
    it.status === 'memorized' ? date(it.memorizedAt) ?? now : null,
    date(it.lastReviewedAt), it.reviewCount ?? 0,
    // une date dans le futur (horloge du téléphone déréglée) est ramenée à maintenant
    new Date(Math.min(date(it.updatedAt)?.getTime() ?? now.getTime(), now.getTime())),
    ...(withFlag ? [it.needsReview ? 1 : 0] : []),
  ]);
  const newer = 'VALUES(updated_at) >= updated_at';
  // L'ordre compte : updated_at est mis à jour en dernier.
  const [res] = await db.query(
    `INSERT INTO memorized_ayahs
       (user_id, surah, ayah, status, memorized_at, last_reviewed_at, review_count, updated_at${withFlag ? ', needs_review' : ''})
     VALUES ?
     ON DUPLICATE KEY UPDATE
       ${withFlag ? `needs_review = IF(${newer}, VALUES(needs_review), needs_review),` : ''}
       status = IF(${newer}, VALUES(status), status),
       memorized_at = IF(${newer}, VALUES(memorized_at), memorized_at),
       last_reviewed_at = IF(${newer}, VALUES(last_reviewed_at), last_reviewed_at),
       review_count = IF(${newer}, VALUES(review_count), review_count),
       updated_at = IF(${newer}, VALUES(updated_at), updated_at)`,
    [values]);
  return res.affectedRows;
}

export const progressItemSchema = {
  type: 'object',
  required: ['surah', 'ayah', 'status'],
  properties: {
    surah: { type: 'integer', minimum: 1, maximum: 114 },
    ayah: { type: 'integer', minimum: 1, maximum: 300 },
    status: { type: 'string', enum: ['learning', 'memorized'] },
    memorizedAt: { type: ['string', 'null'], format: 'date-time' },
    lastReviewedAt: { type: ['string', 'null'], format: 'date-time' },
    reviewCount: { type: 'integer', minimum: 0, maximum: 100000 },
    needsReview: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

/** Statistiques par utilisateur (pour les tableaux admin / responsable). */
export const STATS_SQL = `
  SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at, u.last_login_at,
         COALESCE(SUM(m.status = 'memorized'), 0) AS memorized,
         COALESCE(SUM(m.status = 'learning'), 0)  AS learning,
         MAX(m.updated_at) AS last_activity
  FROM users u LEFT JOIN memorized_ayahs m ON m.user_id = u.id`;

export const statsRow = (r) => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  role: r.role,
  status: r.status,
  createdAt: iso(r.created_at),
  lastLoginAt: iso(r.last_login_at),
  memorized: Number(r.memorized),
  learning: Number(r.learning),
  lastActivity: iso(r.last_activity),
});
