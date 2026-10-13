// Codes de groupe : 6 caractères lisibles (sans 0/O/1/I/L), distincts des codes d'invitation (8 caractères).
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newGroupCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Code saisi par l'utilisateur → forme canonique (majuscules, sans espace ni tiret). */
export const normalizeGroupCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Vrai si le texte saisi a la forme d'un code de groupe (6 caractères) plutôt que d'invitation (8). */
export const looksLikeGroupCode = (c) => normalizeGroupCode(c).length === 6;

/** Groupe correspondant au code, seulement si l'adhésion par code est autorisée (join_open = 1). */
export async function groupByCode(db, code) {
  const [rows] = await db.query(
    'SELECT id, name, join_code FROM study_groups WHERE join_code = ? AND join_open = 1', [normalizeGroupCode(code)]);
  return rows[0] ?? null;
}

/** Donne un code unique à un groupe (nouveau ou régénéré) et le renvoie. */
export async function assignGroupCode(db, groupId) {
  for (let i = 0; i < 10; i++) {
    const code = newGroupCode();
    try {
      await db.query('UPDATE study_groups SET join_code = ? WHERE id = ?', [code, groupId]);
      return code;
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e; // collision improbable : on réessaie
    }
  }
  throw new Error('Impossible de générer un code de groupe unique.');
}

/** Groupes créés avant la 0.10.0 : leur attribuer un code. */
export async function ensureGroupCodes(db) {
  const [rows] = await db.query('SELECT id FROM study_groups WHERE join_code IS NULL');
  for (const r of rows) await assignGroupCode(db, r.id);
}
