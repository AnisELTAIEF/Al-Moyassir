// Rapports pour l'équipe (lot D) : classement par classe ou par établissement, avec périodes, et rythme d'un élève.
// Source UNIQUE : les validations de l'enseignant (D2). Réservé à l'équipe : jamais visible des élèves ni des parents (D7).
import { orgAccessFor } from '../orgAccess.js';
import { ageOf } from './orgs.js';
import { RESULT_CODE, acquiredFlags, memorizationStats, retakePages } from '../reports.js';
import { iso } from '../users.js';

const id36 = { type: 'string', minLength: 36, maxLength: 36 };
const PERIODS = ['month', 'quarter', 'semester', 'year', 'all'];

/** Début de la période civile en cours (mois, trimestre, semestre, année), en UTC ; null = depuis toujours. */
export function periodStart(period, now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  switch (period) {
    case 'month': return new Date(Date.UTC(y, m, 1));
    case 'quarter': return new Date(Date.UTC(y, m - (m % 3), 1));
    case 'semester': return new Date(Date.UTC(y, m < 6 ? 0 : 6, 1));
    case 'year': return new Date(Date.UTC(y, 0, 1));
    default: return null;
  }
}

/** Classement « à égalité, même rang » : suites continues d'ahzab puis de sourates d'abord (c'est ce qui compte en concours). */
const sortKey = (r) => [r.ahzab.longestRun, r.surahs.longestRun, r.ahzab.complete, r.surahs.complete, r.ayat];
const sameKey = (a, b) => sortKey(a).every((v, i) => v === sortKey(b)[i]);
export function rankRows(rows) {
  rows.sort((a, b) => {
    const ka = sortKey(a), kb = sortKey(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return a.fullName.localeCompare(b.fullName, 'ar');
  });
  rows.forEach((r, i) => { r.rank = i > 0 && sameKey(r, rows[i - 1]) ? rows[i - 1].rank : i + 1; });
}

export default async function reportRoutes(app) {
  app.addHook('preHandler', app.authenticate);
  const db = app.db;
  const ref = app.reference;
  const { access, studentOf } = orgAccessFor(app);

  app.get('/:id/reports/ranking', {
    schema: {
      params: { type: 'object', properties: { id: id36 } },
      querystring: { type: 'object', properties: { groupId: id36, period: { enum: PERIODS, default: 'all' } } },
    },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const { groupId, period = 'all' } = req.query;
    const threshold = Number(ctx.org.error_threshold);
    const since = periodStart(period);

    const where = ["p.organization_id = ?", "p.status = 'active'"];
    const args = [ctx.org.id];
    if (groupId) { where.push('EXISTS (SELECT 1 FROM group_students gs WHERE gs.profile_id = p.id AND gs.group_id = ?)'); args.push(groupId); }
    if (!ctx.seesAll) {
      where.push('EXISTS (SELECT 1 FROM group_students gs JOIN group_teachers gt ON gt.group_id = gs.group_id WHERE gs.profile_id = p.id AND gt.user_id = ?)');
      args.push(req.user.id);
    }
    const [students] = await db.query(
      `SELECT p.id, p.full_name, p.father_name, DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_date, DATE_FORMAT(p.joined_at, '%Y-%m-%d') AS joined_at,
              (p.past_competitions IS NOT NULL AND p.past_competitions <> '') AS competitions, p.elite_tag
       FROM student_profiles p WHERE ${where.join(' AND ')} ORDER BY p.full_name LIMIT 2000`, args);
    if (!students.length) return { period, since: since?.toISOString() ?? null, threshold, rows: [] };
    const ids = students.map((s) => s.id);

    const [states] = await db.query('SELECT profile_id, surah, ayah, result FROM validation_state WHERE organization_id = ? AND profile_id IN (?)', [ctx.org.id, ids]);
    const codes = new Map(ids.map((i) => [i, new Uint8Array(ref.total)]));
    for (const s of states) codes.get(s.profile_id)[ref.indexOf(s.surah, s.ayah)] = RESULT_CODE[s.result];

    const [gains] = await db.query(
      `SELECT profile_id, COUNT(*) AS n FROM (SELECT DISTINCT profile_id, surah, ayah FROM validations
        WHERE organization_id = ? AND profile_id IN (?) AND result IN ('acquired','acquired_error')${since ? ' AND created_at >= ?' : ''}) t GROUP BY profile_id`,
      since ? [ctx.org.id, ids, since] : [ctx.org.id, ids]);
    const gain = new Map(gains.map((g) => [g.profile_id, Number(g.n)]));
    const [times] = await db.query('SELECT profile_id, MIN(created_at) AS first, MAX(created_at) AS last FROM validations WHERE organization_id = ? AND profile_id IN (?) GROUP BY profile_id', [ctx.org.id, ids]);
    const when = new Map(times.map((t) => [t.profile_id, t]));
    const [cls] = await db.query(
      'SELECT gs.profile_id, g.name FROM group_students gs JOIN study_groups g ON g.id = gs.group_id WHERE gs.profile_id IN (?) ORDER BY g.name', [ids]);
    const classes = new Map();
    for (const c of cls) (classes.get(c.profile_id) ?? classes.set(c.profile_id, []).get(c.profile_id)).push(c.name);

    const now = Date.now();
    const rows = students.map((s) => {
      const c = codes.get(s.id);
      const { stats } = { stats: memorizationStats(ref, acquiredFlags(ref, c, threshold)) };
      const t = when.get(s.id);
      const from = since ?? (t?.first ? new Date(t.first) : null);
      const weeks = from ? Math.max(1, (now - from.getTime()) / (7 * 86_400_000)) : 1;
      const g = gain.get(s.id) ?? 0;
      return {
        studentId: s.id, fullName: s.full_name, fatherName: s.father_name, age: ageOf(s.birth_date), joinedAt: s.joined_at,
        hasCompetitions: !!s.competitions, classes: classes.get(s.id) ?? [],
        ahzab: stats.ahzab, surahs: stats.surahs, ayat: stats.ayat, retakeCount: retakePages(ref, c, threshold).length,
        gain: g, perWeek: Math.round((g / weeks) * 10) / 10, lastValidationAt: iso(t?.last), rank: 0, elite: false, eliteTag: !!s.elite_tag,
      };
    });
    rankRows(rows);
    // Élèves d'élite (D18) : le haut du classement (10 %, au moins 1, au plus 10) parmi ceux qui ont déjà validé quelque chose.
    const eligible = rows.filter((r) => r.ayat > 0);
    const n = Math.min(10, Math.max(1, Math.ceil(eligible.length * 0.1)));
    for (const r of eligible.slice(0, n)) r.elite = true;
    return { period, since: since?.toISOString() ?? null, threshold, rows };
  });

  // Rythme de mémorisation d'un élève : ayat validés par semaine (semaines de lundi à dimanche, UTC).
  app.get('/:id/students/:pid/rhythm', {
    schema: { params: { type: 'object', properties: { id: id36, pid: id36 } }, querystring: { type: 'object', properties: { weeks: { type: 'integer', minimum: 1, maximum: 52, default: 12 } } } },
  }, async (req) => {
    const ctx = await access(req, req.params.id, ['admin', 'teacher']);
    const st = await studentOf(req, ctx, req.params.pid);
    const weeks = req.query.weeks ?? 12;
    const [rows] = await db.query(
      `SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS w, COUNT(DISTINCT surah, ayah) AS n
       FROM validations WHERE profile_id = ? AND organization_id = ? AND result IN ('acquired','acquired_error')
         AND created_at >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY) GROUP BY w`, [st.id, ctx.org.id, weeks * 7 + 7]);
    const byWeek = new Map(rows.map((r) => [r.w, Number(r.n)]));
    const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(monday.getTime() - i * 7 * 86_400_000).toISOString().slice(0, 10);
      out.push({ weekStart: d, ayat: byWeek.get(d) ?? 0 });
    }
    return { weeks: out };
  });
}
