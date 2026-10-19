import { useEffect, useState } from 'react';
import { useFlash } from '../components';
import { SURAHS } from '../data/surahs';
import { t } from '../i18n';
import type { Api, OrgSummary, Student, ValResult } from '../types';

const NEXT: Record<string, ValResult | 'cleared'> = { none: 'acquired', acquired: 'acquired_error', acquired_error: 'review', review: 'cleared' };
const MARK: Record<ValResult, string> = { acquired: '✓', acquired_error: '✓!', review: '↻' };
const key = (s: number, a: number) => `${s}:${a}`;

/** Validation de la mémorisation par l'enseignant : un clic fait tourner acquis → avec erreur → à revoir → effacé. */
export function ValidationSection({ api, org, student, onSaved }: { api: Api; org: OrgSummary; student: Student; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [surah, setSurah] = useState(1);
  const [res, setRes] = useState<Map<string, ValResult>>(new Map());
  const [retake, setRetake] = useState<number[]>([]);
  const [threshold, setThreshold] = useState(3);
  const [page, setPage] = useState(1);
  const [pageResult, setPageResult] = useState<ValResult | 'cleared'>('acquired');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useFlash(5000);

  useEffect(() => {
    if (!open) return;
    api.studentValidation(org.id, student.id).then((v) => {
      setRes(new Map(v.items.map((i) => [key(i.surah, i.ayah), i.result])));
      setRetake(v.retakePages);
      setThreshold(v.threshold);
    }, (e: Error) => setMsg(e.message));
  }, [open, org.id, student.id]);

  async function send(body: Parameters<Api['putValidation']>[2], apply: (m: Map<string, ValResult>) => void) {
    setBusy(true);
    const before = res;
    const next = new Map(res);
    apply(next);
    setRes(next); // affichage immédiat, rétabli si le serveur refuse
    try {
      const r = await api.putValidation(org.id, student.id, body);
      setRetake(r.retakePages);
      onSaved();
    } catch (e) {
      setRes(before);
      setMsg((e as Error).message);
    }
    setBusy(false);
  }

  const cycle = (a: number) => {
    const cur = res.get(key(surah, a));
    const result = NEXT[cur ?? 'none'];
    return send({ items: [{ surah, ayah: a, result }] }, (m) => (result === 'cleared' ? m.delete(key(surah, a)) : m.set(key(surah, a), result)));
  };
  const whole = (result: ValResult | 'cleared') => {
    const n = SURAHS[surah - 1].ayahs;
    return send({ items: Array.from({ length: n }, (_, i) => ({ surah, ayah: i + 1, result })) },
      (m) => { for (let a = 1; a <= n; a++) result === 'cleared' ? m.delete(key(surah, a)) : m.set(key(surah, a), result); });
  };
  const applyPage = async () => {
    setBusy(true);
    try {
      const r = await api.putValidation(org.id, student.id, { page, result: pageResult });
      setRetake(r.retakePages);
      setMsg(t('{n} ayat modifiés.', { n: r.changed }));
      const v = await api.studentValidation(org.id, student.id);
      setRes(new Map(v.items.map((i) => [key(i.surah, i.ayah), i.result])));
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <h3>{t('Valider la mémorisation')}</h3>
      {!open ? (
        <button className="btn small" onClick={() => setOpen(true)}>{t('Ouvrir la validation')}</button>
      ) : (
        <div className="validate">
          {msg && <p className="error" role="alert">{msg}</p>}
          <label className="field">{t('Sourate')}
            <select value={surah} onChange={(e) => setSurah(Number(e.target.value))}>
              {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n} · {s.name}</option>)}
            </select>
          </label>
          <p className="muted small">{t('Un clic sur un ayah : acquis → acquis avec erreur → à revoir → effacé.')}</p>
          <div className="val-grid" dir="rtl">
            {Array.from({ length: SURAHS[surah - 1].ayahs }, (_, i) => {
              const a = i + 1, r = res.get(key(surah, a));
              return (
                <button key={a} disabled={busy} className={`val ${r ?? 'none'}`} onClick={() => cycle(a)}
                  title={r ? t(r === 'acquired' ? 'Acquis' : r === 'acquired_error' ? 'Acquis avec erreur' : 'À revoir') : t('Non validé')}>
                  <span dir="ltr">{a}{r ? ` ${MARK[r]}` : ''}</span>
                </button>
              );
            })}
          </div>
          <p className="muted small cover-legend">
            <span className="val acquired">✓</span> {t('Acquis')} <span className="val acquired_error">✓!</span> {t('Acquis avec erreur')} <span className="val review">↻</span> {t('À revoir')}
          </p>
          <div className="toolbar">
            <button className="btn small ghost" disabled={busy} onClick={() => whole('acquired')}>{t('Toute la sourate : acquise')}</button>
            <button className="btn small ghost" disabled={busy} onClick={() => whole('cleared')}>{t('Effacer la sourate')}</button>
          </div>
          <div className="toolbar">
            <label className="field inline">{t('Page du mushaf')}
              <input type="number" min={1} max={604} value={page} onChange={(e) => setPage(Math.min(604, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <select value={pageResult} onChange={(e) => setPageResult(e.target.value as ValResult | 'cleared')} aria-label={t('Résultat')}>
              <option value="acquired">{t('Acquis')}</option>
              <option value="acquired_error">{t('Acquis avec erreur')}</option>
              <option value="review">{t('À revoir')}</option>
              <option value="cleared">{t('Effacé')}</option>
            </select>
            <button className="btn small" disabled={busy} onClick={applyPage}>{t('Appliquer à la page')}</button>
          </div>
          {retake.length > 0 && (
            <p><span className="chip wait">{t('Pages à reprendre')}</span> {retake.join(', ')}
              <span className="muted small"> ({t('seuil : {n} ayat avec erreur par page', { n: threshold })})</span></p>
          )}
        </div>
      )}
    </>
  );
}
