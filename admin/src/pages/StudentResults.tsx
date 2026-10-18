import { FormEvent, useState } from 'react';
import { useAsync, useFlash } from '../components';
import { SURAHS } from '../data/surahs';
import { t } from '../i18n';
import type { Api, Assessment, OrgSummary, Student } from '../types';

const day = () => new Date().toISOString().slice(0, 10);
const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '—');

/** Mosaïque de la mémorisation validée : 604 pages par défaut (D), ou les 114 sourates. Lue de droite à gauche, comme le mushaf. */
export function CoverageMap({ pages, surahs }: { pages: string; surahs: string }) {
  const [mode, setMode] = useState<'pages' | 'surahs'>('pages');
  const cells = mode === 'pages' ? pages : surahs;
  return (
    <>
      <div className="toolbar tabs">
        <button className={`btn small ${mode === 'pages' ? '' : 'ghost'}`} onClick={() => setMode('pages')}>{t('604 pages')}</button>
        <button className={`btn small ${mode === 'surahs' ? '' : 'ghost'}`} onClick={() => setMode('surahs')}>{t('114 sourates')}</button>
      </div>
      <div className={`cover ${mode}`} dir="rtl" role="img" aria-label={t('Carte de la mémorisation validée')}>
        {[...cells].map((c, i) => <i key={i} className={`c-${c}`} title={mode === 'pages' ? t('Page {n}', { n: i + 1 }) : SURAHS[i]?.name} />)}
      </div>
      <p className="muted small cover-legend">
        <i className="c-c" /> {t('complet')} <i className="c-p" /> {t('en cours')} <i className="c-r" /> {t('à reprendre')} <i className="c-n" /> {t('non commencé')}
      </p>
    </>
  );
}

/** Ayat validés par semaine : barres des 12 dernières semaines. */
export function Rhythm({ api, org, student }: { api: Api; org: OrgSummary; student: Student }) {
  const r = useAsync(() => api.rhythm(org.id, student.id, 12), [org.id, student.id]);
  const weeks = r.data ?? [];
  const max = Math.max(1, ...weeks.map((w) => w.ayat));
  const total = weeks.reduce((s, w) => s + w.ayat, 0);
  return (
    <>
      <svg viewBox={`0 0 ${weeks.length * 16} 46`} className="rhythm" role="img" aria-label={t('Ayat validés par semaine')}>
        {weeks.map((w, i) => (
          <rect key={w.weekStart} x={i * 16 + 2} width={12} rx={2} y={42 - (w.ayat / max) * 40} height={Math.max(2, (w.ayat / max) * 40)} className={w.ayat ? 'on' : 'off'}>
            <title>{`${w.weekStart} : ${w.ayat}`}</title>
          </rect>
        ))}
      </svg>
      <p className="muted small">{t('{n} ayat validés sur 12 semaines · moyenne {m} par semaine', { n: total, m: weeks.length ? Math.round((total / weeks.length) * 10) / 10 : 0 })}</p>
    </>
  );
}

/** Examens et concours, certificats et encouragements d'un élève (lot E). */
export function ResultsSection({ api, org, student, canAdmin, canReward }: { api: Api; org: OrgSummary; student: Student; canAdmin: boolean; canReward: boolean }) {
  const res = useAsync(() => api.studentResults(org.id, student.id), [org.id, student.id]);
  const [msg, setMsg] = useFlash(5000);
  const [a, setA] = useState({ kind: 'exam' as Assessment['kind'], title: '', heldOn: day(), score: '', rank: '' });
  const [c, setC] = useState<{ title: string; issuedOn: string; file: File | null }>({ title: '', issuedOn: day(), file: null });
  const [r, setR] = useState({ kind: 'message' as 'message' | 'gift', title: '', body: '' });
  const run = (fn: () => Promise<unknown>, ok?: string) => fn().then(() => { if (ok) setMsg(ok); res.reload(); }, (e: Error) => setMsg(e.message));
  const d = res.data;

  const open = (cid: string) => api.certificateLink(org.id, cid).then((u) => window.open(u, '_blank', 'noopener'), (e: Error) => setMsg(e.message));
  const submitAssessment = (e: FormEvent) => { e.preventDefault(); run(async () => { await api.addAssessment(org.id, student.id, { ...a, score: a.score || undefined, rank: a.rank || undefined }); setA({ ...a, title: '', score: '', rank: '' }); }, t('Résultat enregistré.')); };
  const submitCert = (e: FormEvent) => { e.preventDefault(); if (!c.file) return; run(async () => { await api.uploadCertificate(org.id, student.id, { title: c.title, issuedOn: c.issuedOn, file: c.file! }); setC({ title: '', issuedOn: day(), file: null }); (e.target as HTMLFormElement).reset(); }, t('Certificat envoyé : l’élève est prévenu.')); };
  const submitReward = (e: FormEvent) => { e.preventDefault(); run(async () => { await api.addReward(org.id, student.id, { kind: r.kind, title: r.title, body: r.body || undefined }); setR({ ...r, title: '', body: '' }); }, r.kind === 'message' ? t('Message envoyé à l’élève.') : t('Cadeau enregistré : l’élève n’est prévenu qu’une fois remis.')); };

  return (
    <>
      {msg && <p className="error" role="alert">{msg}</p>}
      {res.error && <p className="error">{res.error}</p>}

      <h3>{t('Examens et concours')}</h3>
      <ul className="list plain">
        {(d?.assessments ?? []).map((x) => (
          <li key={x.id}><span>{x.kind === 'exam' ? t('Examen') : t('Concours')} · {x.title}<br /><span className="muted small">{fmt(x.heldOn)}{x.score ? ` · ${x.score}` : ''}{x.rank ? ` · ${t('rang')} ${x.rank}` : ''}</span></span>
            {canAdmin && <button className="btn ghost small danger-text" onClick={() => window.confirm(t('Supprimer ce résultat ?')) && run(() => api.deleteAssessment(org.id, x.id))}>{t('Supprimer')}</button>}</li>
        ))}
        {d && d.assessments.length === 0 && <li className="muted">{t('Aucun résultat.')}</li>}
      </ul>
      {canAdmin && (
        <form className="invite-form" onSubmit={submitAssessment}>
          <label>{t('Type')}<select value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value as Assessment['kind'] })}><option value="exam">{t('Examen')}</option><option value="competition">{t('Concours')}</option></select></label>
          <label>{t('Intitulé')}<input required maxLength={160} value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} /></label>
          <label>{t('Date')}<input type="date" required value={a.heldOn} onChange={(e) => setA({ ...a, heldOn: e.target.value })} /></label>
          <label>{t('Note')}<input maxLength={40} value={a.score} onChange={(e) => setA({ ...a, score: e.target.value })} placeholder="18/20" /></label>
          <label>{t('Rang')}<input maxLength={40} value={a.rank} onChange={(e) => setA({ ...a, rank: e.target.value })} /></label>
          <button className="btn small">{t('Ajouter le résultat')}</button>
        </form>
      )}

      <h3>{t('Certificats')}</h3>
      <ul className="list plain">
        {(d?.certificates ?? []).map((x) => (
          <li key={x.id}><span>{x.title}<br /><span className="muted small">{fmt(x.issuedOn)} · {Math.max(1, Math.round(x.size / 1024))} {t('Ko')}</span></span>
            <span className="row-actions"><button className="btn ghost small" onClick={() => open(x.id)}>{t('Ouvrir')}</button>
              {canAdmin && <button className="btn ghost small danger-text" onClick={() => window.confirm(t('Supprimer ce certificat ?')) && run(() => api.deleteCertificate(org.id, x.id))}>{t('Supprimer')}</button>}</span></li>
        ))}
        {d && d.certificates.length === 0 && <li className="muted">{t('Aucun certificat.')}</li>}
      </ul>
      {canAdmin && (
        <form className="invite-form" onSubmit={submitCert}>
          <label>{t('Intitulé')}<input required maxLength={160} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} /></label>
          <label>{t('Date')}<input type="date" required value={c.issuedOn} onChange={(e) => setC({ ...c, issuedOn: e.target.value })} /></label>
          <label>{t('Fichier (PDF, PNG ou JPEG, 5 Mo)')}<input type="file" required accept="application/pdf,image/png,image/jpeg" onChange={(e) => setC({ ...c, file: e.target.files?.[0] ?? null })} /></label>
          <button className="btn small" disabled={!c.file || c.file.size > 5 * 1024 * 1024}>{t('Envoyer le certificat')}</button>
          {c.file && c.file.size > 5 * 1024 * 1024 && <p className="error span-all">{t('Fichier trop volumineux (5 Mo au maximum).')}</p>}
        </form>
      )}

      <h3>{t('Encouragements')}</h3>
      <ul className="list plain">
        {(d?.rewards ?? []).map((x) => (
          <li key={x.id}><span>{x.kind === 'gift' ? '🎁 ' : '✉ '}{x.title}{x.body && <><br /><span className="muted small">{x.body}</span></>}</span>
            <span className="row-actions">
              {x.kind === 'gift' && <button className={`chip ${x.giftStatus === 'given' ? 'ok' : 'wait'}`} onClick={() => run(() => api.setGiftGiven(org.id, x.id, x.giftStatus !== 'given'))}>
                {x.giftStatus === 'given' ? `${t('remis')} ${fmt(x.givenOn)}` : t('à remettre')}</button>}
              {canAdmin && <button className="btn ghost small danger-text" onClick={() => run(() => api.deleteReward(org.id, x.id))}>✕</button>}
            </span></li>
        ))}
        {d && d.rewards.length === 0 && <li className="muted">{t('Aucun encouragement.')}</li>}
      </ul>
      {canReward && (
        <form className="invite-form" onSubmit={submitReward}>
          <label>{t('Type')}<select value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as 'message' | 'gift' })}><option value="message">{t('Message d’encouragement')}</option><option value="gift">{t('Cadeau')}</option></select></label>
          <label>{t('Intitulé')}<input required maxLength={160} value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} /></label>
          <label className="span-all">{t('Détail (facultatif)')}<input maxLength={400} value={r.body} onChange={(e) => setR({ ...r, body: e.target.value })} /></label>
          <button className="btn small">{t('Enregistrer')}</button>
        </form>
      )}
    </>
  );
}
