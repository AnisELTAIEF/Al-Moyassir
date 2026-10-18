import { useState } from 'react';
import { useAsync, useFlash } from '../components';
import { exportExcel, exportWord, fileStem } from '../export';
import { t } from '../i18n';
import type { Api, OrgSummary, Period } from '../types';

const PERIODS: [Period, string][] = [['month', 'Ce mois'], ['quarter', 'Ce trimestre'], ['semester', 'Ce semestre'], ['year', 'Cette année'], ['all', 'Depuis toujours']];
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

/** « متابعة » : suivi des élèves et classement (équipe seulement, D7), par classe ou pour tout l'établissement, avec export. */
export default function Follow({ api, org, onOpen }: { api: Api; org: OrgSummary; onOpen: (studentId: string) => void }) {
  const [period, setPeriod] = useState<Period>('all');
  const [classId, setClassId] = useState('');
  const [msg, setMsg] = useFlash();
  const classes = useAsync(() => api.orgClasses(org.id), [org.id]);
  const rank = useAsync(() => api.ranking(org.id, { classId: classId || undefined, period }), [org.id, classId, period]);
  const rows = rank.data?.rows ?? [];
  const periodLabel = t(PERIODS.find(([p]) => p === period)![1]);
  const title = `${t('Classement')} — ${org.name}`;
  const scope = `${classId ? classes.data?.find((c) => c.id === classId)?.name : t('Tous les élèves')} · ${periodLabel}`;
  const stem = fileStem(org.name, period);
  const fail = (e: unknown) => setMsg((e as Error).message);

  return (
    <>
      <p className="muted small">{t('Classement réservé à l’équipe : les élèves et leurs parents ne le voient jamais. Il ne compte que les validations de l’enseignant ; les suites continues de ahzab puis de sourates passent en premier (comme en concours).')}</p>
      <div className="toolbar">
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label={t('Période')}>{PERIODS.map(([p, l]) => <option key={p} value={p}>{t(l)}</option>)}</select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('Classe')}>
          <option value="">{t('Tout l’établissement')}</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn ghost small" disabled={!rows.length} onClick={() => exportExcel(rows, title, stem).catch(fail)}>{t('Exporter Excel')}</button>
        <button className="btn ghost small" disabled={!rows.length} onClick={() => exportWord(rows, title, scope, stem).catch(fail)}>{t('Exporter Word')}</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      {rank.error && <p className="error">{rank.error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr>
            <th>#</th><th>{t('Élève')}</th><th>{t('Âge')}</th><th title={t('Ahzab entiers · suite continue')}>{t('Ahzab')}</th><th title={t('Sourates entières · suite continue')}>{t('Sourates')}</th>
            <th>{t('Ayat')}</th><th title={t('Ayat validés sur la période')}>{t('Gain')}</th><th>{t('Par semaine')}</th><th>{t('Dernière validation')}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="num">{r.rank}</td>
                <td><button className="link" onClick={() => onOpen(r.studentId)}>{r.fullName}</button>{r.elite && <span className="chip ok" title={t('Élève d’élite')}> ★ {t('élite')}</span>}
                  {r.retakeCount > 0 && <span className="chip wait" title={t('Pages à reprendre')}> {r.retakeCount}</span>}
                  <br /><span className="muted small">{r.classes.join(' · ')}</span></td>
                <td className="num">{r.age ?? '—'}</td>
                <td className="nowrap"><strong>{r.ahzab.complete}</strong> <span className="muted small">/ {t('suite')} {r.ahzab.longestRun}</span></td>
                <td className="nowrap"><strong>{r.surahs.complete}</strong> <span className="muted small">/ {t('suite')} {r.surahs.longestRun}</span></td>
                <td className="num">{r.ayat}</td><td className="num">{r.gain}</td><td className="num">{r.perWeek}</td><td className="nowrap">{fmtDate(r.lastValidationAt)}</td>
              </tr>
            ))}
            {rank.data && rows.length === 0 && <tr><td colSpan={9} className="muted">{t('Aucun élève à afficher.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
