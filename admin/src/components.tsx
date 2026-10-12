import { useEffect, useMemo, useState } from 'react';
import { SURAHS, TOTAL_AYAHS } from './data/surahs';
import { fmtPct, memorizedPerSurah, pct, sinceLabel } from './lib';
import type { AyahProgress } from './types';

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
