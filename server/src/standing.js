// Position d'un élève (par rapport à sa classe et à toute l'association) : visible de l'élève lui-même,
// sans nom ni détail sur les autres. Même classement que celui de l'équipe (suites continues d'ahzab, puis
// de sourates, puis totaux) sur l'ensemble des validations.
import { RESULT_CODE, acquiredFlags, memorizationStats } from './reports.js';
import { rankRows } from './routes/reports.js';

/**
 * @returns {Promise<{ association: { rank: number|null, of: number }, classes: { name: string, rank: number|null, of: number }[] }>}
 * `rank` vaut null tant que l'élève n'a encore rien d'acquis (pas de classement sans mémorisation).
 */
export async function standingOf(db, ref, org, profileId) {
  const [students] = await db.query(
    "SELECT id, full_name FROM student_profiles WHERE organization_id = ? AND status = 'active'", [org.id]);
  if (!students.some((s) => s.id === profileId)) return { association: { rank: null, of: students.length }, classes: [] };
  const [states] = await db.query('SELECT profile_id, surah, ayah, result FROM validation_state WHERE organization_id = ?', [org.id]);
  const codes = new Map(students.map((s) => [s.id, new Uint8Array(ref.total)]));
  for (const s of states) {
    const c = codes.get(s.profile_id);
    if (c) c[ref.indexOf(s.surah, s.ayah)] = RESULT_CODE[s.result];
  }
  const threshold = Number(org.error_threshold);
  const all = students.map((s) => {
    const stats = memorizationStats(ref, acquiredFlags(ref, codes.get(s.id), threshold));
    return { id: s.id, fullName: s.full_name, ahzab: stats.ahzab, surahs: stats.surahs, ayat: stats.ayat, rank: 0 };
  });
  const rankIn = (rows) => {
    const copy = rows.map((r) => ({ ...r }));
    rankRows(copy);
    const me = copy.find((r) => r.id === profileId);
    return { rank: me && me.ayat > 0 ? me.rank : null, of: copy.length };
  };
  const [mine] = await db.query(
    `SELECT g.id, g.name FROM group_students gs JOIN study_groups g ON g.id = gs.group_id
     WHERE gs.profile_id = ? ORDER BY g.name`, [profileId]);
  const classes = [];
  for (const g of mine) {
    const [members] = await db.query('SELECT profile_id FROM group_students WHERE group_id = ?', [g.id]);
    const ids = new Set(members.map((m) => m.profile_id));
    classes.push({ name: g.name, ...rankIn(all.filter((r) => ids.has(r.id))) });
  }
  return { association: rankIn(all), classes };
}
