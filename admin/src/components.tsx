import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SURAHS, TOTAL_AYAHS } from './data/surahs';
import { downloadCsv, fmtPct, importResultCsv, memorizedPerSurah, pct, readTextFile, sinceLabel } from './lib';
import type { AyahProgress, CreatedInvitation, ImportItem, ImportResult } from './types';

export const Bar = ({ value, label }: { value: number; label?: string }) => (
  <div className="bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
    <div style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
  </div>
);

/** Mosaïque des 114 sourates (droite → gauche) : la case se colore selon la part apprise, safran si complète. */
export function SurahMap({ items }: { items: AyahProgress[] }) {
  const per = useMemo(() => memorizedPerSurah(items), [items]);
  return (
    <div className="mosaic" dir="rtl" aria-label="Carte des sourates apprises">
      {SURAHS.map((s, i) => {
        const r = per[i] / s.ayahs;
        return (
          <div key={s.n} className={`tile${r >= 1 ? ' full' : r >= 0.45 ? ' dark' : ''}`} style={{ ['--r' as string]: r }}
            title={`${s.n}. ${s.name} — ${per[i]}/${s.ayahs} ayat appris`}>{s.n}</div>
        );
      })}
    </div>
  );
}

/** Message éphémère : s'efface tout seul au bout de `ms` (3 s par défaut). */
export function useFlash(ms = 3000): [string | null, (m: string | null) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback((m: string | null) => {
    setMsg(m);
    clearTimeout(timer.current);
    if (m) timer.current = setTimeout(() => setMsg(null), ms);
  }, [ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [msg, flash];
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    setError(null);
    load().then((d) => !off && setData(d), (e: Error) => !off && setError(e.message || 'Chargement impossible.'));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/** Panneau latéral : progression détaillée d'une personne. */
export function ProgressPanel({ title, subtitle, load, onClose, children }: {
  title: string; subtitle?: string; load: () => Promise<AyahProgress[]>; onClose: () => void; children?: React.ReactNode;
}) {
  const { data: items, error } = useAsync(load, [title]);
  const memorized = items?.filter((p) => p.status === 'memorized').length ?? 0;
  const per = useMemo(() => memorizedPerSurah(items ?? []), [items]);
  const recent = useMemo(() => [...(items ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12), [items]);
  return (
    <aside className="panel" aria-label={`Progression de ${title}`}>
      <div className="panel-head">
        <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
        <button className="btn ghost icon" onClick={onClose} aria-label="Fermer">✕</button>
      </div>
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="muted">Chargement…</p>}
      {items && (
        <>
          <p className="big"><strong>{memorized}</strong> ayat appris <span className="muted">· {fmtPct(memorized)} du Coran · {items.length - memorized} en cours</span></p>
          <Bar value={pct(memorized) / 100} label="Part du Coran apprise" />
          <h3>Mosaïque des sourates</h3>
          <SurahMap items={items} />
          <h3>Par sourate</h3>
          {per.every((c) => c === 0) && <p className="muted">Aucun ayah appris pour l’instant.</p>}
          <ul className="list">
            {per.map((c, i) => c > 0 && (
              <li key={i}>
                <span className="ar">{SURAHS[i].name}</span>
                <Bar value={c / SURAHS[i].ayahs} />
                <span className="muted num">{c}/{SURAHS[i].ayahs}</span>
              </li>
            ))}
          </ul>
          <h3>Activité récente</h3>
          <ul className="list plain">
            {recent.map((p) => (
              <li key={`${p.surah}:${p.ayah}`}>
                <span><span className="ar">{SURAHS[p.surah - 1].name}</span> · ayah {p.ayah}</span>
                <span className="muted">{p.status === 'memorized' ? 'appris' : 'en cours'} · {sinceLabel(p.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {children}
    </aside>
  );
}

export const TOTAL = TOTAL_AYAHS;

/** Résultat d'une invitation : e-mail parti automatiquement, ou message à copier / ouvrir dans sa messagerie. */
export function InvitationResult({ created }: { created: CreatedInvitation }) {
  const [copied, setCopied] = useState(false);
  const subject = created.subject ?? 'Invitation Almoyassir (الميسّر)';
  const mailto = `mailto:${encodeURIComponent(created.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(created.message)}`;
  return (
    <div className="card created" role="status">
      <div>
        {created.emailed
          ? <p>✓ E-mail d’invitation envoyé à <strong>{created.email}</strong>. Code (affiché une seule fois) :</p>
          : <p>Invitation créée pour <strong>{created.email}</strong>. Envoyez-lui le message ci-contre ; le code ne sera plus affiché ensuite :</p>}
        <div className="code">{created.code}</div>
        {created.link && <p className="muted small">Lien : {created.link}</p>}
        {!created.emailed && created.mailConfigured && <p className="warn small">L’envoi automatique a échoué : envoyez le message vous-même.</p>}
      </div>
      <div className="row-actions">
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(created.message); setCopied(true); }}>{copied ? 'Message copié ✓' : 'Copier le message'}</button>
        {!created.emailed && <a className="btn ghost" href={mailto}>Ouvrir dans ma messagerie</a>}
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<ImportItem['action'], [string, string]> = {
  added: ['Ajouté(e)', 'ok'], updated: ['Mis à jour', 'ok'], invited: ['Invité(e)', 'wait'],
  unchanged: ['Inchangé', ''], error: ['Erreur', 'off'],
};

/**
 * Import d'une liste d'utilisateurs (fichier TXT / CSV ou texte collé) : « Vérifier » simule
 * l'import et affiche le résultat ligne par ligne ; « Importer » l'exécute pour de bon.
 */
export function ImportPanel({ format, example, templateName, run, onDone }: {
  format: ReactNode; example: string; templateName: string;
  run: (text: string, dryRun: boolean) => Promise<ImportResult>; onDone?: () => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [checked, setChecked] = useState<string | null>(null); // texte vérifié (simulation)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go(dryRun: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await run(text, dryRun);
      setResult(r);
      setChecked(dryRun ? text : null);
      if (!dryRun) onDone?.();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setText(await readTextFile(f));
    setResult(null); setChecked(null);
  }
  const s = result?.summary;
  const todo = s ? s.added + s.updated + s.invited : 0;

  return (
    <div className="card import">
      <div className="import-help">{format}</div>
      <div className="row-actions">
        <label className="btn ghost small file">Choisir un fichier (.txt, .csv)
          <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn ghost small" onClick={() => downloadCsv(templateName, '﻿' + example)}>Télécharger un modèle</button>
      </div>
      <textarea rows={8} value={text} placeholder={example} spellCheck={false} aria-label="Liste à importer"
        onChange={(e) => { setText(e.target.value); setChecked(null); }} />
      <div className="row-actions">
        <button className="btn ghost" disabled={busy || !text.trim()} onClick={() => go(true)}>1. Vérifier</button>
        <button className="btn" disabled={busy || checked !== text || todo === 0}
          onClick={() => window.confirm(`Importer : ${todo} personne(s) seront ajoutées ou invitées. Continuer ?`) && go(false)}>
          2. Importer{checked === text && todo ? ` (${todo})` : ''}
        </button>
        {busy && <span className="muted small">Traitement…</span>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {result && s && (
        <div role="status">
          <p>
            <strong>{result.dryRun ? 'Simulation (rien n’est encore modifié) :' : '✓ Import terminé :'}</strong>{' '}
            {s.invited} invitation(s), {s.added} ajout(s) de comptes existants{s.updated ? `, ${s.updated} mise(s) à jour` : ''},
            {' '}{s.unchanged} inchangé(s), {s.errors} erreur(s).
            {s.groupsCreated.length > 0 && <> Groupes {result.dryRun ? 'à créer' : 'créés'} : {s.groupsCreated.join(', ')}.</>}
          </p>
          {!result.dryRun && (result.emailing > 0
            ? <p className="muted small">{result.emailing} e-mail(s) d’invitation en cours d’envoi. La page Invitations indique ceux qui sont partis.</p>
            : s.invited > 0 && <p className="warn small">Envoi automatique non configuré : téléchargez le résultat (codes et liens) pour transmettre les invitations.</p>)}
          {!result.dryRun && <button className="btn ghost small" onClick={() => downloadCsv(`import-${new Date().toISOString().slice(0, 10)}`, importResultCsv(result.items))}>
            Télécharger le résultat (CSV, avec les codes)</button>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ligne</th><th>Nom</th><th>E-mail</th><th>Groupe</th><th>Rôle</th><th>Résultat</th><th>Détail</th>{!result.dryRun && <th>Code</th>}</tr></thead>
              <tbody>
                {result.items.map((i) => (
                  <tr key={`${i.line}-${i.group ?? ''}`}>
                    <td>{i.line}</td>
                    <td>{i.name ?? '—'}</td>
                    <td>{i.email ?? <span className="muted small">{i.text}</span>}</td>
                    <td>{i.group ?? '—'}</td>
                    <td>{i.role === 'admin' ? 'Admin' : i.role ? 'Membre' : '—'}</td>
                    <td><span className={`chip ${ACTION_LABEL[i.action][1]}`}>{ACTION_LABEL[i.action][0]}</span></td>
                    <td className="small">{i.message}</td>
                    {!result.dryRun && <td className="mono">{i.code ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
