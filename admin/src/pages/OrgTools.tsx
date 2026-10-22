// Outils d'établissement : inviter un enseignant (avec ou sans e-mail), valider pour plusieurs élèves à la fois
// (dont le hifdh déjà fait sur papier), corbeille à deux niveaux.
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { InvitationResult, useAsync, useFlash } from '../components';
import { SURAHS } from '../data/surahs';
import { t } from '../i18n';
import type { Api, OrgInvitation, OrgInviteResult, OrgSummary, PassageRange, TrashItem, ValResult } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

/** Inviter un enseignant (ou un administratif) : e-mail facultatif ; compte existant = ajouté tout de suite. */
export function OrgInviteForm({ api, org, classId = null, className = null, onDone }: {
  api: Api; org: OrgSummary; classId?: string | null; className?: string | null; onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher');
  const [result, setResult] = useState<OrgInviteResult | null>(null);
  const [msg, setMsg] = useFlash(6000);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.inviteToOrg(org.id, { email: email.trim() || undefined, displayName: name.trim() || undefined, role, classId });
      setResult(r);
      setEmail(''); setName('');
      onDone();
    } catch (err) { setMsg((err as Error).message); }
    setBusy(false);
  }

  return (
    <div>
      <form className="card invite-form" onSubmit={submit}>
        <label>{t('Nom de l’enseignant')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('ex. الشيخ أحمد')} /></label>
        <label>{t('E-mail (facultatif)')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@gmail.com" /></label>
        {!classId && (
          <label>{t('Rôle')}<select value={role} onChange={(e) => setRole(e.target.value as 'teacher' | 'admin')}>
            <option value="teacher">{t('Enseignant (مدرس)')}</option><option value="admin">{t('Administratif (إداري)')}</option></select></label>
        )}
        <button className="btn" disabled={busy || (!email.trim() && !name.trim())}>{classId ? t('Inviter dans {c}', { c: className ?? '' }) : t('Inviter')}</button>
        <p className="muted small span-all">{t('Sans e-mail : un code à transmettre (WhatsApp, SMS…) ; la personne s’inscrit avec l’adresse de son choix. Compte existant : ajouté tout de suite.')}</p>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      {result && (result.existingAccount
        ? <p className="note" role="status">✓ {t('{e} a déjà un compte : ajouté(e) à l’établissement.', { e: result.email })} {result.emailed ? t('E-mail envoyé.') : ''}</p>
        : <InvitationResult key={result.code} created={result} />)}
    </div>
  );
}

/** Invitations d'établissement en attente (avec ou sans e-mail), révocables. */
export function PendingOrgInvitations({ api, org, refresh }: { api: Api; org: OrgSummary; refresh: number }) {
  const list = useAsync(() => api.orgInvitations(org.id), [org.id, refresh]);
  const [msg, setMsg] = useFlash();
  const items: OrgInvitation[] = list.data ?? [];
  if (!items.length) return null;
  return (
    <>
      <h3>{t('Invitations en attente')}</h3>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t('Personne')}</th><th>{t('Rôle')}</th><th>{t('Classe')}</th><th>{t('Expire le')}</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.displayName ?? '—'}<br /><span className="muted small">{i.email ?? t('sans e-mail (code à transmettre)')}</span></td>
                <td>{i.role === 'admin' ? t('Administratif (إداري)') : t('Enseignant (مدرس)')}</td>
                <td>{i.className ?? '—'}</td>
                <td className="nowrap">{i.expiresAt.slice(0, 10)}</td>
                <td><button className="btn ghost small danger-text" onClick={() => window.confirm(t('Révoquer cette invitation ? Elle ira dans la corbeille.')) && api.revokeOrgInvitation(org.id, i.id).then(list.reload, (e: Error) => setMsg(e.message))}>{t('Révoquer')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Piece = { kind: 'pages'; from: number; to: number } | { kind: 'passage'; surah: number; from: number; to: number };
const pieceLabel = (p: Piece) => p.kind === 'pages'
  ? t('Pages {a} à {b}', { a: p.from, b: p.to })
  : `${SURAHS[p.surah - 1].name} ${p.from}${p.to !== p.from ? `–${p.to}` : ''}`;

/**
 * Valider la mémorisation pour plusieurs élèves à la fois : on choisit les pages ou passages déjà appris, on décoche les
 * absents, et on valide. L'administratif peut aussi saisir un hifdh validé sur papier, avec la date réelle.
 */
export function GroupValidate({ api, org, canBackdate }: { api: Api; org: OrgSummary; canBackdate: boolean }) {
  const classes = useAsync(() => api.orgClasses(org.id), [org.id]);
  const [classId, setClassId] = useState('');
  const students = useAsync(() => api.orgStudents(org.id, { classId: classId || undefined, status: 'active' }), [org.id, classId]);
  const [off, setOff] = useState<Set<string>>(new Set()); // décochés (absents)
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [mode, setMode] = useState<'pages' | 'passage'>('pages');
  const [pFrom, setPFrom] = useState(1);
  const [pTo, setPTo] = useState(1);
  const [surah, setSurah] = useState(1);
  const [aFrom, setAFrom] = useState(1);
  const [aTo, setATo] = useState(1);
  const [result, setResult] = useState<ValResult | 'cleared'>('acquired');
  const [paper, setPaper] = useState(false);
  const [at, setAt] = useState(today());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useFlash(8000);
  const [report, setReport] = useState<string[] | null>(null);

  const list = students.data ?? [];
  useEffect(() => { setOff(new Set()); }, [classId]);
  const chosen = useMemo(() => list.filter((s) => !off.has(s.id)), [list, off]);
  const maxAyah = SURAHS[surah - 1].ayahs;

  function addPiece() {
    if (mode === 'pages') {
      const a = Math.min(pFrom, pTo), b = Math.max(pFrom, pTo);
      setPieces([...pieces, { kind: 'pages', from: a, to: b }]);
    } else {
      const a = Math.min(aFrom, aTo), b = Math.min(maxAyah, Math.max(aFrom, aTo));
      setPieces([...pieces, { kind: 'passage', surah, from: Math.min(a, maxAyah), to: b }]);
    }
  }

  async function apply() {
    const pages = [...new Set(pieces.flatMap((p) => p.kind === 'pages' ? Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i) : []))];
    const ranges: PassageRange[] = pieces.flatMap((p) => p.kind === 'passage' ? [{ surah: p.surah, from: p.from, to: p.to }] : []);
    const what = pieces.map(pieceLabel).join(' · ');
    if (!window.confirm(t('Valider « {w} » pour {n} élève(s) ?', { w: what, n: chosen.length }) + (paper ? `\n${t('Hifdh saisi comme validé le')} ${at}.` : ''))) return;
    setBusy(true);
    try {
      const r = await api.bulkValidation(org.id, {
        studentIds: chosen.map((s) => s.id), ...(pages.length ? { pages } : {}), ...(ranges.length ? { ranges } : {}), result, ...(paper && canBackdate ? { at } : {}),
      });
      setReport(r.results.filter((x) => x.error).map((x) => `${list.find((s) => s.id === x.studentId)?.fullName ?? x.studentId} : ${x.error}`));
      setMsg(t('{n} élève(s) mis à jour.', { n: r.changed }) + (r.errors ? ` ${t('{n} refusé(s).', { n: r.errors })}` : ''));
      setPieces([]);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <p className="muted small">{t('Choisissez la classe, cochez les élèves présents (décochez les absents), indiquez les pages ou passages déjà appris, puis validez.')}</p>
      {msg && <p className="note" role="status">{msg}</p>}
      {report && report.length > 0 && <ul className="error small">{report.map((r) => <li key={r}>{r}</li>)}</ul>}
      <div className="toolbar">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('Classe')}>
          <option value="">{t('Tous les élèves')}</option>
          {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn ghost small" onClick={() => setOff(new Set())}>{t('Tout cocher')}</button>
        <button className="btn ghost small" onClick={() => setOff(new Set(list.map((s) => s.id)))}>{t('Tout décocher')}</button>
        <span className="muted small">{chosen.length} / {list.length}</span>
      </div>
      <div className="card">
        {list.length === 0 && <p className="muted">{t('Aucun élève à afficher.')}</p>}
        <div className="check-grid">
          {list.map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={!off.has(s.id)}
              onChange={(e) => { const n = new Set(off); e.target.checked ? n.delete(s.id) : n.add(s.id); setOff(n); }} /> {s.fullName}</label>
          ))}
        </div>
      </div>

      <h3>{t('Ce qui est appris')}</h3>
      <div className="card validate">
        <div className="toolbar">
          <select value={mode} onChange={(e) => setMode(e.target.value as 'pages' | 'passage')} aria-label={t('Type')}>
            <option value="pages">{t('Pages du mushaf')}</option><option value="passage">{t('Passage d’une sourate')}</option>
          </select>
          {mode === 'pages' ? (
            <>
              <label className="field inline">{t('de la page')}<input type="number" min={1} max={604} value={pFrom} onChange={(e) => setPFrom(Math.min(604, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <label className="field inline">{t('à la page')}<input type="number" min={1} max={604} value={pTo} onChange={(e) => setPTo(Math.min(604, Math.max(1, Number(e.target.value) || 1)))} /></label>
            </>
          ) : (
            <>
              <select value={surah} onChange={(e) => { setSurah(Number(e.target.value)); setAFrom(1); setATo(1); }} aria-label={t('Sourate')}>
                {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n} · {s.name}</option>)}
              </select>
              <label className="field inline">{t('de l’ayah')}<input type="number" min={1} max={maxAyah} value={aFrom} onChange={(e) => setAFrom(Math.min(maxAyah, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <label className="field inline">{t('à l’ayah')}<input type="number" min={1} max={maxAyah} value={aTo} onChange={(e) => setATo(Math.min(maxAyah, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <button className="btn ghost small" onClick={() => { setAFrom(1); setATo(maxAyah); }}>{t('Toute la sourate')}</button>
            </>
          )}
          <button className="btn small" onClick={addPiece}>{t('Ajouter')}</button>
        </div>
        <p>{pieces.length === 0 ? <span className="muted small">{t('Rien d’ajouté pour l’instant.')}</span> : pieces.map((p, i) => (
          <span key={i} className="chip ok">{pieceLabel(p)} <button className="link" aria-label={t('Retirer')} onClick={() => setPieces(pieces.filter((_, j) => j !== i))}>✕</button></span>
        ))}</p>
        <div className="toolbar">
          <select value={result} onChange={(e) => setResult(e.target.value as ValResult | 'cleared')} aria-label={t('Résultat')}>
            <option value="acquired">{t('Acquis')}</option><option value="acquired_error">{t('Acquis avec erreur')}</option>
            <option value="review">{t('À revoir')}</option><option value="cleared">{t('Effacé')}</option>
          </select>
          {canBackdate && (
            <label className="check"><input type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} /> {t('Hifdh déjà validé sur papier')}</label>
          )}
          {canBackdate && paper && <input type="date" value={at} max={today()} onChange={(e) => setAt(e.target.value)} aria-label={t('Date réelle de la validation')} />}
        </div>
        {paper && <p className="muted small">{t('Saisie sur la date réelle de la validation : elle compte dans les périodes du suivi ; l’élève n’est pas alerté.')}</p>}
        <button className="btn" disabled={busy || pieces.length === 0 || chosen.length === 0} onClick={apply}>
          {t('Valider pour {n} élève(s)', { n: chosen.length })}
        </button>
      </div>
    </>
  );
}

/** Corbeille : niveau 1 (30 jours, établissement) puis niveau 2 (30 jours, admin global). */
export function TrashPanel({ load, restore, purge, showOrg = false }: {
  load: () => Promise<TrashItem[]>; restore: (id: string) => Promise<void>; purge?: (id: string) => Promise<void>; showOrg?: boolean;
}) {
  const list = useAsync(load, []);
  const [msg, setMsg] = useFlash();
  const items = list.data ?? [];
  const fail = (e: Error) => setMsg(e.message);
  return (
    <>
      <p className="muted small">{t('Les éléments supprimés restent 30 jours ici (niveau 1), puis 30 jours dans la corbeille de l’administrateur général (niveau 2), puis sont supprimés définitivement.')}</p>
      {msg && <p className="error" role="alert">{msg}</p>}
      {list.error && <p className="error">{list.error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t('Élément')}</th><th>{t('Type')}</th>{showOrg && <th>{t('Établissement')}</th>}<th>{t('Supprimé le')}</th><th>{t('Niveau')}</th><th>{t('Jours restants')}</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.label}<br /><span className="muted small">{i.deletedBy ?? ''}</span></td>
                <td>{t(i.kindLabel)}</td>
                {showOrg && <td>{i.orgName ?? '—'}</td>}
                <td className="nowrap">{i.deletedAt.slice(0, 10)}</td>
                <td><span className={`chip ${i.level === 1 ? 'ok' : 'wait'}`}>{i.level}</span></td>
                <td className="num">{i.daysLeft}</td>
                <td className="nowrap">
                  <button className="btn ghost small" onClick={() => restore(i.id).then(() => { setMsg(t('Élément restauré.')); list.reload(); }, fail)}>{t('Restaurer')}</button>
                  {purge && <button className="btn ghost small danger-text" onClick={() => window.confirm(t('Supprimer définitivement ? C’est irréversible.')) && purge(i.id).then(list.reload, fail)}>{t('Supprimer définitivement')}</button>}
                </td>
              </tr>
            ))}
            {list.data && items.length === 0 && <tr><td colSpan={showOrg ? 7 : 6} className="muted">{t('La corbeille est vide.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
