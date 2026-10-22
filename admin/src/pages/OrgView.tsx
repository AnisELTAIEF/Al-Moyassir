import { FormEvent, useEffect, useState } from 'react';
import { useAsync, useFlash } from '../components';
import { downloadCsv, readTextFile } from '../lib';
import type { Api, OrgClass, OrgRole, OrgSummary, OrgType, Student, StudentImportResult, StudentInput } from '../types';
import { ORG_TYPE, classWord } from './orgLabels';
import Follow from './Follow';
import { CoverageMap, Rhythm, ResultsSection } from './StudentResults';
import { ValidationSection } from './Validate';
import { GroupValidate, OrgInviteForm, PendingOrgInvitations, TrashPanel } from './OrgTools';
import { t } from '../i18n';

type Tab = 'students' | 'validate' | 'follow' | 'classes' | 'team' | 'trash' | 'settings';
const ROLE: Record<OrgRole, string> = { admin: 'Administratif (إداري)', teacher: 'Enseignant (مدرس)', student: 'Élève (طالب)' };
const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDay = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—');

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function OrgView({ api, org, isGlobalAdmin, onBack, onChanged }: {
  api: Api; org: OrgSummary; isGlobalAdmin: boolean; onBack: () => void; onChanged: () => void;
}) {
  const canEdit = isGlobalAdmin || org.roles.includes('admin');
  const canReward = canEdit || org.roles.includes('teacher');
  const [tab, setTab] = useState<Tab>('students');
  const [selected, setSelected] = useState<string | null>(null);
  const [current, setCurrent] = useState(org);
  const tabs: [Tab, string][] = [['students', 'Élèves'], ...(canReward ? ([['validate', 'Validation groupée']] as [Tab, string][]) : []), ['follow', 'Suivi (متابعة)'], ['classes', 'Classes'], ...(canEdit ? ([['team', 'Équipe'], ['trash', 'Corbeille'], ['settings', 'Réglages']] as [Tab, string][]) : [])];
  return (
    <>
      <button className="btn ghost small" onClick={onBack}>{t('← Établissements')}</button>
      <h1>{current.name}</h1>
      <p className="muted lead">{ORG_TYPE[current.type]} · {current.address || 'adresse non renseignée'}</p>
      <div className="toolbar tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn small ${tab === t ? '' : 'ghost'}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'students' && <StudentsTab api={api} org={current} canEdit={canEdit} canReward={canReward} isGlobalAdmin={isGlobalAdmin} selected={selected} setSelected={setSelected} />}
      {tab === 'validate' && canReward && <GroupValidate api={api} org={current} canBackdate={canEdit} />}
      {tab === 'trash' && canEdit && <TrashPanel load={() => api.orgTrash(current.id)} restore={(id) => api.restoreOrgTrash(current.id, id)} />}
      {tab === 'follow' && <Follow api={api} org={current} onOpen={(id) => { setSelected(id); setTab('students'); }} />}
      {tab === 'classes' && <ClassesTab api={api} org={current} canEdit={canEdit} />}
      {tab === 'team' && canEdit && <TeamTab api={api} org={current} />}
      {tab === 'settings' && canEdit && <SettingsTab api={api} org={current} onSaved={(o) => { setCurrent({ ...current, ...o }); onChanged(); }} />}
    </>
  );
}

// ───────────────────────── Élèves ─────────────────────────

interface Form {
  fullName: string; fatherName: string; birthDate: string; gender: '' | 'm' | 'f'; phone: string; guardianPhone: string;
  joinedAt: string; hifdhStartedAt: string; pastCompetitions: string;
}
/** L'autorisation des parents n'est exigée que jusqu'à 14 ans inclus, ou si l'âge est inconnu. */
function needsConsent(birthDate: string): boolean {
  if (!birthDate) return true;
  const b = new Date(`${birthDate}T00:00:00Z`), n = new Date();
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) age--;
  return age <= 14;
}
const emptyForm: Form = { fullName: '', fatherName: '', birthDate: '', gender: '', phone: '', guardianPhone: '', joinedAt: today(), hifdhStartedAt: '', pastCompetitions: '' };
const formOf = (s: Student): Form => ({
  fullName: s.fullName, fatherName: s.fatherName, birthDate: s.birthDate ?? '', gender: s.gender ?? '', phone: s.phone ?? '', guardianPhone: s.guardianPhone ?? '',
  joinedAt: s.joinedAt ?? '', hifdhStartedAt: s.hifdhStartedAt ?? '', pastCompetitions: s.pastCompetitions,
});
const inputOf = (f: Form): StudentInput => ({
  fullName: f.fullName.trim(), fatherName: f.fatherName.trim(), birthDate: f.birthDate || null, gender: f.gender || null,
  phone: f.phone.trim() || null, guardianPhone: f.guardianPhone.trim() || null, joinedAt: f.joinedAt || null, hifdhStartedAt: f.hifdhStartedAt || null, pastCompetitions: f.pastCompetitions.trim() || null,
});

function StudentFields({ f, set }: { f: Form; set: (f: Form) => void }) {
  const on = (k: keyof Form) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value });
  return (
    <>
      <label>{t('Nom et prénom (الإسم واللقب)')}<input required minLength={2} value={f.fullName} onChange={on('fullName')} /></label>
      <label>{t('Prénom du père (إسم الأب)')}<input value={f.fatherName} onChange={on('fatherName')} /></label>
      <label>{t('Date de naissance')}<input type="date" value={f.birthDate} max={today()} onChange={on('birthDate')} /></label>
      <label>{t('Sexe')}<select value={f.gender} onChange={on('gender')}><option value="">—</option><option value="m">{t('Garçon')}</option><option value="f">{t('Fille')}</option></select></label>
      <label>{t('Téléphone (format international)')}<input inputMode="tel" placeholder="+218 91 234 5678" value={f.phone} onChange={on('phone')} /></label>
      <label>{t('Téléphone du parent (format international)')}<input inputMode="tel" placeholder="+218 92 123 4567" value={f.guardianPhone} onChange={on('guardianPhone')} /></label>
      <label>{t('Date d’adhésion (تاريخ الإنخراط)')}<input type="date" value={f.joinedAt} onChange={on('joinedAt')} /></label>
      <label>{t('Début du hifdh (تاريخ بداية الحفظ)')}<input type="date" value={f.hifdhStartedAt} onChange={on('hifdhStartedAt')} /></label>
      <label className="span-all">{t('Participations précédentes à des concours')}<textarea rows={2} value={f.pastCompetitions} onChange={on('pastCompetitions')} /></label>
    </>
  );
}

const IMPORT_EXAMPLE = 'Nom complet;Prénom du père;Date de naissance;Sexe;Téléphone;Téléphone du parent;Classe\nAhmed Ben Ali;Salem;2012-05-03;m;;+218 92 123 4567;Classe 1\nSara Trabelsi;Mohamed;14/09/2010;f;+218 91 234 5678;+218 92 765 4321;Classe 1\n';
const IMPORT_ACTION: Record<'created' | 'unchanged' | 'error', [string, string]> = { created: ['Créée', 'ok'], unchanged: ['Déjà inscrit(e)', ''], error: ['Erreur', 'off'] };

/** Import en masse de fiches élèves (TXT / CSV ou texte collé) : « Vérifier » simule, « Importer » crée. */
function StudentImport({ api, org, classes, onDone }: { api: Api; org: OrgSummary; classes: OrgClass[]; onDone: () => void }) {
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [createClasses, setCreateClasses] = useState(true);
  const [groupId, setGroupId] = useState('');
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = `${text}|${consent}|${createClasses}|${groupId}`;
  const s = result?.summary;

  async function go(dryRun: boolean) {
    setBusy(true); setErr(null);
    try {
      const r = await api.importStudents(org.id, text, dryRun, { guardianConsent: consent, createClasses, groupId: groupId || null });
      setResult(r);
      setChecked(dryRun ? key : null);
      if (!dryRun) onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function pick(f: File | undefined) {
    if (!f) return;
    setText(await readTextFile(f));
    setResult(null); setChecked(null);
  }

  return (
    <div className="card import">
      <div className="import-help">
        <p><strong>{t('Format')} :</strong> {t('une fiche par ligne')} : <code>Nom complet ; Prénom du père ; Date de naissance ; Sexe ; Téléphone ; Téléphone du parent ; Classe</code> ({t('point-virgule, tabulation ou virgule ; seul le nom est obligatoire')}).</p>
        <p className="muted small">{t('Date : AAAA-MM-JJ ou JJ/MM/AAAA. Sexe : m ou f. Téléphones au format international. Un élève déjà inscrit (même nom et même prénom du père) n’est pas recréé. Cliquez d’abord sur Vérifier : rien n’est créé avant Importer.')}</p>
      </div>
      <div className="row-actions">
        <label className="btn ghost small file">{t('Choisir un fichier (.txt, .csv)')}
          <input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn ghost small" onClick={() => downloadCsv('modele-import-eleves', '﻿' + IMPORT_EXAMPLE)}>{t('Télécharger un modèle')}</button>
      </div>
      <textarea rows={8} value={text} placeholder={IMPORT_EXAMPLE} spellCheck={false} aria-label={t('Liste à importer')}
        onChange={(e) => { setText(e.target.value); setChecked(null); }} />
      <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('Les parents des élèves de 14 ans ou moins (ou d’âge inconnu) ont autorisé l’enregistrement de leurs informations.')}</label>
      <label className="check"><input type="checkbox" checked={createClasses} onChange={(e) => setCreateClasses(e.target.checked)} /> {t('Créer les classes absentes (colonne Classe)')}</label>
      <label>{t('Ou mettre tous ces élèves dans la classe')}
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">{t('— d’après la colonne Classe —')}</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="row-actions">
        <button className="btn ghost" disabled={busy || !text.trim()} onClick={() => go(true)}>1. {t('Vérifier')}</button>
        <button className="btn" disabled={busy || checked !== key || !s || s.created === 0}
          onClick={() => window.confirm(`${s?.created ?? 0} fiche(s) seront créées. Continuer ?`) && go(false)}>
          2. {t('Importer')}{checked === key && s?.created ? ` (${s.created})` : ''}
        </button>
        {busy && <span className="muted small">{t('Traitement…')}</span>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {result && s && (
        <div role="status">
          <p>
            <strong>{result.dryRun ? t('Simulation (rien n’est encore créé) :') : t('✓ Import terminé :')}</strong>{' '}
            {s.created} {t('fiche(s)')}, {s.unchanged} {t('déjà inscrit(s)')}, {s.errors} {t('erreur(s)')}.
            {s.classesCreated.length > 0 && <> {t('Classes')} {result.dryRun ? t('à créer') : t('créées')} : {s.classesCreated.join(', ')}.</>}
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('Ligne')}</th><th>{t('Nom')}</th><th>{t('Classe')}</th><th>{t('Résultat')}</th><th>{t('Détail')}</th></tr></thead>
              <tbody>
                {result.items.map((i) => (
                  <tr key={i.line}>
                    <td>{i.line}</td><td>{i.name ?? <span className="muted small">{i.text}</span>}</td><td>{i.className ?? '—'}</td>
                    <td><span className={`chip ${IMPORT_ACTION[i.action][1]}`}>{t(IMPORT_ACTION[i.action][0])}</span></td><td className="small">{i.message}</td>
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

function StudentsTab({ api, org, canEdit, canReward, isGlobalAdmin, selected, setSelected }: {
  api: Api; org: OrgSummary; canEdit: boolean; canReward: boolean; isGlobalAdmin: boolean; selected: string | null; setSelected: (id: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [classId, setClassId] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [newClasses, setNewClasses] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useFlash();
  const classes = useAsync(() => api.orgClasses(org.id), [org.id]);
  const list = useAsync(() => api.orgStudents(org.id, { q: dq, classId: classId || undefined, status: showLeft ? 'left' : 'active' }), [org.id, dq, classId, showLeft]);
  const students = list.data ?? [];
  const sel = students.find((s) => s.id === selected);

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      let r = await api.createStudent(org.id, { ...inputOf(form), guardianConsent: needsConsent(form.birthDate) }, newClasses, false);
      if ('duplicates' in r) {
        const names = r.duplicates.map((d) => `${d.fullName} (fils de ${d.fatherName || '—'})${d.status === 'left' ? ' — sorti' : ''}`).join('\n');
        if (!window.confirm(`Un élève porte déjà ce nom et ce prénom du père :\n\n${names}\n\nCréer quand même une nouvelle fiche ?`)) return;
        r = await api.createStudent(org.id, { ...inputOf(form), guardianConsent: needsConsent(form.birthDate) }, newClasses, true);
      }
      if ('student' in r) {
        setMsg(`Fiche de ${r.student.fullName} créée.`);
        setForm(emptyForm); setNewClasses([]); setConsent(false); setAdding(false); setSelected(r.student.id);
        list.reload(); classes.reload();
      }
    } catch (err) { setMsg((err as Error).message); }
  }

  return (
    <div className={sel ? 'with-panel' : undefined}>
      <div>
        <div className="toolbar">
          <input placeholder={t('Rechercher (nom, père, téléphone)')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Rechercher un élève')} />
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t('Filtrer par classe')}>
            <option value="">{t('Toutes les classes')}</option>
            {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> {t('Élèves sortis')}</label>
          {canEdit && !showLeft && <button className="btn small" onClick={() => setAdding(!adding)}>{adding ? 'Annuler' : '+ Ajouter un élève'}</button>}
          {canEdit && !showLeft && <button className="btn ghost small" onClick={() => setImporting(!importing)}>{importing ? t('Fermer') : t('Importer une liste')}</button>}
        </div>
        {adding && canEdit && (
          <form className="card invite-form" onSubmit={add}>
            <StudentFields f={form} set={setForm} />
            {(classes.data ?? []).length > 0 && (
              <fieldset className="span-all"><legend className="small muted">Classes ({classWord(org.type)})</legend>
                {(classes.data ?? []).map((c) => (
                  <label key={c.id} className="check"><input type="checkbox" checked={newClasses.includes(c.id)}
                    onChange={(e) => setNewClasses(e.target.checked ? [...newClasses, c.id] : newClasses.filter((x) => x !== c.id))} /> {c.name}</label>
                ))}
              </fieldset>
            )}
            {needsConsent(form.birthDate) ? (
              <label className="check span-all"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('Les parents ont autorisé l’enregistrement des informations de l’enfant (nom, âge, téléphone, résultats).')}</label>
            ) : (
              <p className="muted small span-all">{t('Plus de 14 ans : l’autorisation des parents n’est pas requise.')}</p>
            )}
            <button className="btn" disabled={needsConsent(form.birthDate) && !consent}>{t('Créer la fiche')}</button>
          </form>
        )}
        {importing && canEdit && <StudentImport api={api} org={org} classes={classes.data ?? []} onDone={() => { list.reload(); classes.reload(); }} />}
        {msg && <p className="error" role="alert">{msg}</p>}
        {list.error && <p className="error">{list.error}</p>}
        <div className="card table-wrap">
          <table>
            <thead><tr><th>{t('Élève')}</th><th>{t('Âge')}</th><th>{t('Téléphone')}</th><th>{t('Classes')}</th><th>{t('Compte')}</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className={s.id === selected ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setSelected(s.id === selected ? null : s.id)}>{s.fullName}</button>
                    {s.fatherName && <span className="muted small"> · ابن {s.fatherName}</span>}</td>
                  <td className="num">{s.age ?? '—'}</td>
                  <td className="nowrap">{s.phone ? <>{s.phone} <span className={`chip ${s.phoneVerified ? 'ok' : 'wait'}`}>{s.phoneVerified ? 'vérifié' : 'à vérifier'}</span></> : '—'}
                    {s.guardianPhone && <><br /><span className="muted small">{t('Parent')} : {s.guardianPhone}</span></>}</td>
                  <td>{s.classes.map((c) => c.name).join(', ') || '—'}</td>
                  <td>{s.linked ? <span className="chip ok">{t('lié')}</span> : <span className="chip off">{t('non lié')}</span>}</td>
                </tr>
              ))}
              {list.data && students.length === 0 && <tr><td colSpan={5} className="muted">{showLeft ? 'Aucun élève sorti.' : 'Aucun élève à afficher.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <StudentFiche key={sel.id} api={api} org={org} student={sel} classes={classes.data ?? []} canEdit={canEdit} canReward={canReward} isGlobalAdmin={isGlobalAdmin}
        onClose={() => setSelected(null)} onChange={() => { list.reload(); classes.reload(); }} />}
    </div>
  );
}

function StudentFiche({ api, org, student: s, classes, canEdit, canReward, isGlobalAdmin, onClose, onChange }: {
  api: Api; org: OrgSummary; student: Student; classes: OrgClass[]; canEdit: boolean; canReward: boolean; isGlobalAdmin: boolean; onClose: () => void; onChange: () => void;
}) {
  const [form, setForm] = useState<Form>(formOf(s));
  const [msg, setMsg] = useFlash(5000);
  const [phoneCode, setPhoneCode] = useState<{ code: string; phone: string; expiresAt: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [link, setLink] = useState<{ code: string; expiresAt: string } | null>(null);
  const run = (fn: () => Promise<unknown>, ok?: string) => fn().then(() => { if (ok) setMsg(ok); onChange(); }, (e: Error) => setMsg(e.message));
  const summary = useAsync(() => api.studentSummary(org.id, s.id), [org.id, s.id]);
  const retainOver = s.status === 'left' && !!s.retainUntil && s.retainUntil <= today();

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() => api.updateStudent(org.id, s.id, inputOf(form)), 'Fiche enregistrée.');
  }

  const codeMsg = (code: string) =>
    `رمز التحقق من رقم هاتفك في ${org.name}: ${code}\nCode de vérification (${org.name}) : ${code} — valable 15 minutes.`;
  const linkMsg = (code: string) =>
    `رمز ربط حساب ${s.fullName} بملفه في ${org.name}: ${code}\nCode pour relier le compte de ${s.fullName} à sa fiche (${org.name}) : ${code}\nApplication : Compte → Mes établissements → Saisir un code.`;

  return (
    <aside className="panel" aria-label={`Fiche de ${s.fullName}`}>
      <div className="panel-head">
        <div><h2>{s.fullName}</h2><p className="muted">{s.fatherName ? `ابن ${s.fatherName} · ` : ''}{s.age != null ? `${s.age} ans` : 'âge inconnu'}
          {s.status === 'left' && ' · sorti'}</p></div>
        <button className="btn ghost icon" onClick={onClose} aria-label={t('Fermer')}>✕</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <p className="muted small">Autorisation des parents : {s.guardianConsentAt ? `recueillie le ${new Date(s.guardianConsentAt).toLocaleDateString('fr-FR')}` : s.age != null && s.age > 14 ? 'non requise (plus de 14 ans)' : 'non enregistrée'}</p>
      <label className="check"><input type="checkbox" checked={s.eliteTag} onChange={(e) => run(() => api.setStudentElite(org.id, s.id, e.target.checked))} /> ★ {t('ضمن النخبة')} <span className="muted small">({t('étiquette posée par l’équipe')})</span></label>

      {canEdit ? (
        <form className="invite-form" onSubmit={save}>
          <StudentFields f={form} set={setForm} />
          <button className="btn">{t('Enregistrer')}</button>
        </form>
      ) : (
        <ul className="list plain">
          <li><span>{t('Téléphone')}</span><span>{s.phone ?? '—'}</span></li>
          <li><span>{t('Téléphone du parent')}</span><span>{s.guardianPhone ?? '—'}</span></li>
          <li><span>{t('Adhésion')}</span><span>{fmtDay(s.joinedAt)}</span></li>
          <li><span>{t('Début du hifdh')}</span><span>{fmtDay(s.hifdhStartedAt)}</span></li>
        </ul>
      )}

      <h3>{t('Mémorisation validée')}</h3>
      {summary.error && <p className="error">{summary.error}</p>}
      {summary.data && (
        <>
          <ul className="list plain">
            <li><span>{t('Ahzab entiers')}</span><span><strong>{summary.data.stats.ahzab.complete}</strong> {t('· suite continue max')} <strong>{summary.data.stats.ahzab.longestRun}</strong></span></li>
            <li><span>{t('Sourates entières')}</span><span><strong>{summary.data.stats.surahs.complete}</strong> {t('· suite continue max')} <strong>{summary.data.stats.surahs.longestRun}</strong></span></li>
            <li><span>{t('Pages entières')}</span><span><strong>{summary.data.stats.pages.complete}</strong> / 604 {t('· suite continue max')} <strong>{summary.data.stats.pages.longestRun}</strong></span></li>
            <li><span>{t('Ayat comptés')}</span><span><strong>{summary.data.stats.ayat}</strong> / 6214</span></li>
          </ul>
          <p className="muted small">Seules les validations de l’enseignant comptent (حفظ إجمالي / مسترسل). {summary.data.validatedAyat === 0 ? 'Aucune validation pour l’instant.' : ''}</p>
          {summary.data.retakePages.length > 0 && (
            <p><span className="chip wait">{t('Pages à reprendre')}</span> {summary.data.retakePages.join(', ')}
              <span className="muted small"> (seuil : {summary.data.threshold} ayat avec erreur par page)</span></p>
          )}
          <CoverageMap pages={summary.data.pages} surahs={summary.data.surahs} />
        </>
      )}

      {s.status === 'active' && <ValidationSection api={api} org={org} student={s} onSaved={summary.reload} />}

      <h3>{t('Rythme de mémorisation')}</h3>
      <Rhythm api={api} org={org} student={s} />

      <ResultsSection api={api} org={org} student={s} canAdmin={canEdit} canReward={canReward} />

      <h3>{t('Téléphone')}</h3>
      {!s.phone ? <p className="muted small">{t('Aucun numéro enregistré.')}</p> : (
        <>
          <p>{s.phone} <span className={`chip ${s.phoneVerified ? 'ok' : 'wait'}`}>{s.phoneVerified ? 'vérifié' : 'à vérifier'}</span></p>
          {!s.phoneVerified && (
            <>
              <button className="btn ghost small" onClick={() => run(async () => setPhoneCode(await api.studentPhoneCode(org.id, s.id)))}>{t('Générer un code de vérification')}</button>
              {phoneCode && phoneCode.phone === s.phone && (
                <div className="created">
                  <p>{t('Envoyez ce code à l’élève par WhatsApp, puis saisissez ci-dessous le code qu’il vous communique (valable 15 min, 5 essais).')}</p>
                  <p><strong className="code mono">{phoneCode.code}</strong></p>
                  <a className="btn small" href={waLink(phoneCode.phone, codeMsg(phoneCode.code))} target="_blank" rel="noopener">{t('Envoyer par WhatsApp')}</a>
                  <div className="inline-form">
                    <input inputMode="numeric" maxLength={6} placeholder={t('Code reçu de l’élève')} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('Code communiqué par l’élève')} />
                    <button className="btn small" onClick={() => run(async () => { await api.verifyStudentPhone(org.id, s.id, typed); setPhoneCode(null); setTyped(''); }, 'Numéro vérifié.')}>{t('Valider')}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {canEdit && (
        <>
          <h3>{t('Compte de l’élève')}</h3>
          <p>{s.linked ? <span className="chip ok">{t('compte lié')}</span> : <span className="chip off">{t('aucun compte lié')}</span>}</p>
          {s.linked ? (
            <button className="btn ghost small danger-text" onClick={() => window.confirm('Détacher le compte de cette fiche ?') && run(() => api.unlinkStudent(org.id, s.id), 'Compte détaché.')}>{t('Détacher le compte')}</button>
          ) : s.status === 'active' && (
            <>
              <p className="muted small">{t('Le parent crée un compte pour son enfant, puis saisit ce code dans l’application pour le rattacher à la fiche.')}</p>
              <button className="btn ghost small" onClick={() => run(async () => setLink(await api.studentLinkCode(org.id, s.id)))}>{t('Générer un code de liaison')}</button>
              {link && (
                <div className="created">
                  <p><strong className="code mono">{link.code}</strong> <span className="muted small">{t('valable 7 jours, usage unique')}</span></p>
                  {s.phone && <a className="btn small" href={waLink(s.phone, linkMsg(link.code))} target="_blank" rel="noopener">{t('Envoyer par WhatsApp')}</a>}
                </div>
              )}
            </>
          )}

          <h3>{t('Classes')}</h3>
          {classes.length === 0 ? <p className="muted small">{t('Créez d’abord une classe (onglet « Classes »).')}</p> : classes.map((c) => (
            <label key={c.id} className="check"><input type="checkbox" checked={s.classes.some((k) => k.id === c.id)}
              onChange={(e) => run(() => api.setClassStudent(org.id, c.id, s.id, e.target.checked))} /> {c.name}</label>
          ))}

          <h3>{t('Archivage')}</h3>
          {s.status === 'active' ? (
            <>
              <p className="muted small">{t('Un élève qui quitte l’établissement est archivé, jamais supprimé : ses données sont conservées au moins 5 ans.')}</p>
              <button className="btn ghost small danger-text" onClick={() => window.confirm(`Marquer ${s.fullName} comme sorti de l’établissement ?\nSa fiche sera conservée 5 ans.`) && run(() => api.leaveStudent(org.id, s.id), 'Élève marqué comme sorti.')}>{t('Marquer comme sorti')}</button>
            </>
          ) : (
            <>
              <p className="muted small">Sorti le {fmtDay(s.leftAt)} · conservation jusqu’au {fmtDay(s.retainUntil)}.</p>
              <div className="row-actions">
                <button className="btn ghost small" onClick={() => run(() => api.restoreStudent(org.id, s.id), 'Élève réintégré.')}>{t('Réintégrer')}</button>
                {isGlobalAdmin && (
                  <button className="btn ghost small danger-text" disabled={!retainOver} title={retainOver ? undefined : 'La durée de conservation n’est pas écoulée.'}
                    onClick={() => window.confirm(`Supprimer DÉFINITIVEMENT la fiche de ${s.fullName} ? Cette action est irréversible.`) && run(async () => { await api.deleteStudent(org.id, s.id); onClose(); }, 'Fiche supprimée.')}>{t('Supprimer définitivement')}</button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}

// ───────────────────────── Classes ─────────────────────────

function ClassesTab({ api, org, canEdit }: { api: Api; org: OrgSummary; canEdit: boolean }) {
  const list = useAsync(() => api.orgClasses(org.id), [org.id]);
  const team = useAsync(() => (canEdit ? api.orgMembers(org.id) : Promise.resolve([])), [org.id, canEdit]);
  const [name, setName] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [msg, setMsg] = useFlash();
  const fail = (e: Error) => setMsg(e.message);
  const teachers = (team.data ?? []).filter((m) => m.roles.includes('teacher'));

  return (
    <>
      <p className="muted small">{classWord(org.type)} : un enseignant ne voit que les élèves de ses classes.</p>
      {msg && <p className="error" role="alert">{msg}</p>}
      {list.error && <p className="error">{list.error}</p>}
      <div className="grid">
        {(list.data ?? []).map((c) => (
          <div key={c.id} className="card group-card">
            <strong className="big">{c.name}</strong>
            <span className="muted">{c.studentCount} élève{c.studentCount > 1 ? 's' : ''}</span>
            <span className="small">{c.teachers.length === 0 ? <span className="muted">{t('Aucun enseignant')}</span> : c.teachers.map((t) => (
              <span key={t.userId} className="chip ok">{t.displayName}{canEdit && <button className="link" aria-label={`Retirer ${t.displayName}`}
                onClick={() => api.setClassTeacher(org.id, c.id, t.userId, false).then(list.reload, fail)}> ✕</button>}</span>
            ))}</span>
            {canEdit && (
              <div className="row-actions">
                <select aria-label={t('Affecter un enseignant')} value="" onChange={(e) => e.target.value && api.setClassTeacher(org.id, c.id, e.target.value, true).then(list.reload, fail)}>
                  <option value="">{t('+ Enseignant…')}</option>
                  {teachers.filter((t) => !c.teachers.some((x) => x.userId === t.userId)).map((t) => <option key={t.userId} value={t.userId}>{t.displayName}</option>)}
                </select>
                <button className="btn ghost small" onClick={() => setInviting(inviting === c.id ? null : c.id)}>{inviting === c.id ? t('Fermer') : t('+ Inviter un enseignant')}</button>
                <button className="btn ghost small" onClick={() => { const n = window.prompt('Nouveau nom de la classe', c.name); if (n?.trim()) api.renameClass(org.id, c.id, n.trim()).then(list.reload, fail); }}>{t('Renommer')}</button>
                <button className="btn ghost small danger-text" onClick={() => window.confirm(`Supprimer la classe « ${c.name} » ? Les fiches des élèves sont conservées.`) && api.deleteClass(org.id, c.id).then(list.reload, fail)}>{t('Supprimer')}</button>
              </div>
            )}
            {canEdit && inviting === c.id && <OrgInviteForm api={api} org={org} classId={c.id} className={c.name} onDone={() => { list.reload(); team.reload(); }} />}
          </div>
        ))}
        {list.data?.length === 0 && <p className="muted">Aucune classe{canEdit ? ' : créez la première ci-dessous.' : ' ne vous est affectée.'}</p>}
      </div>
      {canEdit && (
        <form className="card inline-form" onSubmit={(e) => { e.preventDefault(); api.createClass(org.id, name.trim()).then(() => { setName(''); list.reload(); }, fail); }}>
          <input placeholder={t('Nom de la nouvelle classe (ex. فوج 1)')} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} aria-label={t('Nom de la nouvelle classe')} />
          <button className="btn">{t('Créer la classe')}</button>
        </form>
      )}
    </>
  );
}

// ───────────────────────── Équipe ─────────────────────────

function TeamTab({ api, org }: { api: Api; org: OrgSummary }) {
  const list = useAsync(() => api.orgMembers(org.id), [org.id]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('teacher');
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useFlash();
  const fail = (e: Error) => setMsg(e.message);
  return (
    <>
      <h3>{t('Inviter un enseignant ou un administratif')}</h3>
      <OrgInviteForm api={api} org={org} onDone={() => { list.reload(); setPending((n) => n + 1); }} />
      <PendingOrgInvitations api={api} org={org} refresh={pending} />
      <h3>{t('Ajouter une personne qui a déjà un compte')}</h3>
      <p className="muted small">{t('La personne doit d’abord avoir créé son compte (application ou page de connexion) avec cet e-mail.')}</p>
      <form className="card invite-form" onSubmit={(e) => { e.preventDefault(); api.addOrgMember(org.id, email.trim(), role).then(() => { setEmail(''); list.reload(); }, fail); }}>
        <label>{t('E-mail')}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('prenom.nom@gmail.com')} /></label>
        <label>{t('Rôle')}<select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
          <option value="teacher">{ROLE.teacher}</option><option value="admin">{ROLE.admin}</option></select></label>
        <button className="btn">{t('Ajouter à l’équipe')}</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>{t('Personne')}</th><th>{t('Rôles')}</th><th /></tr></thead>
          <tbody>
            {(list.data ?? []).filter((m) => m.roles.some((r) => r !== 'student')).map((m) => (
              <tr key={m.userId}>
                <td>{m.displayName}<br /><span className="muted small">{m.email}</span></td>
                <td>{m.roles.filter((r) => r !== 'student').map((r) => (
                  <span key={r} className="chip ok">{ROLE[r]} <button className="link" aria-label={`Retirer le rôle ${ROLE[r]} à ${m.displayName}`}
                    onClick={() => window.confirm(`Retirer le rôle « ${ROLE[r]} » à ${m.displayName} ?`) && api.removeOrgMember(org.id, m.userId, r).then(list.reload, fail)}>✕</button></span>
                ))}</td>
                <td />
              </tr>
            ))}
            {list.data && list.data.length === 0 && <tr><td colSpan={3} className="muted">{t('Aucun membre dans l’équipe.')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ───────────────────────── Réglages ─────────────────────────

function SettingsTab({ api, org, onSaved }: { api: Api; org: OrgSummary; onSaved: (o: OrgSummary) => void }) {
  const [name, setName] = useState(org.name);
  const [type, setType] = useState<OrgType>(org.type);
  const [address, setAddress] = useState(org.address);
  const [threshold, setThreshold] = useState(org.errorThreshold);
  const [msg, setMsg] = useFlash();
  async function save(e: FormEvent) {
    e.preventDefault();
    try { onSaved(await api.updateOrg(org.id, { name: name.trim(), type, address: address.trim(), errorThreshold: threshold })); setMsg('Réglages enregistrés.'); }
    catch (err) { setMsg((err as Error).message); }
  }
  return (
    <form className="card invite-form" onSubmit={save}>
      <label>{t('Nom')}<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>{t('Type')}<select value={type} onChange={(e) => setType(e.target.value as OrgType)}>
        <option value="association">{ORG_TYPE.association}</option><option value="mosque">{ORG_TYPE.mosque}</option></select></label>
      <label>{t('Adresse (مقر الإدارة)')}<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <label>{t('Seuil « page à reprendre »')}<input type="number" min={1} max={20} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        <span className="muted small">{t('Nombre d’ayat « acquis avec erreur » sur une même page à partir duquel la page est à reprendre.')}</span></label>
      <button className="btn">{t('Enregistrer')}</button>
      {msg && <p className="error span-all" role="alert">{msg}</p>}
    </form>
  );
}
