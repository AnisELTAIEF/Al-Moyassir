import { FormEvent, useEffect, useState } from 'react';
import { useAsync, useFlash } from '../components';
import type { Api, OrgClass, OrgRole, OrgSummary, OrgType, Student, StudentInput } from '../types';
import { ORG_TYPE, classWord } from './orgLabels';

type Tab = 'students' | 'classes' | 'team' | 'settings';
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
  const [tab, setTab] = useState<Tab>('students');
  const [current, setCurrent] = useState(org);
  const tabs: [Tab, string][] = [['students', 'Élèves'], ['classes', 'Classes'], ...(canEdit ? ([['team', 'Équipe'], ['settings', 'Réglages']] as [Tab, string][]) : [])];
  return (
    <>
      <button className="btn ghost small" onClick={onBack}>← Établissements</button>
      <h1>{current.name}</h1>
      <p className="muted lead">{ORG_TYPE[current.type]} · {current.address || 'adresse non renseignée'}</p>
      <div className="toolbar tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn small ${tab === t ? '' : 'ghost'}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'students' && <StudentsTab api={api} org={current} canEdit={canEdit} isGlobalAdmin={isGlobalAdmin} />}
      {tab === 'classes' && <ClassesTab api={api} org={current} canEdit={canEdit} />}
      {tab === 'team' && canEdit && <TeamTab api={api} org={current} />}
      {tab === 'settings' && canEdit && <SettingsTab api={api} org={current} onSaved={(o) => { setCurrent({ ...current, ...o }); onChanged(); }} />}
    </>
  );
}

// ───────────────────────── Élèves ─────────────────────────

interface Form {
  fullName: string; fatherName: string; birthDate: string; gender: '' | 'm' | 'f'; phone: string;
  joinedAt: string; hifdhStartedAt: string; pastCompetitions: string;
}
const emptyForm: Form = { fullName: '', fatherName: '', birthDate: '', gender: '', phone: '', joinedAt: today(), hifdhStartedAt: '', pastCompetitions: '' };
const formOf = (s: Student): Form => ({
  fullName: s.fullName, fatherName: s.fatherName, birthDate: s.birthDate ?? '', gender: s.gender ?? '', phone: s.phone ?? '',
  joinedAt: s.joinedAt ?? '', hifdhStartedAt: s.hifdhStartedAt ?? '', pastCompetitions: s.pastCompetitions,
});
const inputOf = (f: Form): StudentInput => ({
  fullName: f.fullName.trim(), fatherName: f.fatherName.trim(), birthDate: f.birthDate || null, gender: f.gender || null,
  phone: f.phone.trim() || null, joinedAt: f.joinedAt || null, hifdhStartedAt: f.hifdhStartedAt || null, pastCompetitions: f.pastCompetitions.trim() || null,
});

function StudentFields({ f, set }: { f: Form; set: (f: Form) => void }) {
  const on = (k: keyof Form) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value });
  return (
    <>
      <label>Nom et prénom (الإسم واللقب)<input required minLength={2} value={f.fullName} onChange={on('fullName')} /></label>
      <label>Prénom du père (إسم الأب)<input value={f.fatherName} onChange={on('fatherName')} /></label>
      <label>Date de naissance<input type="date" value={f.birthDate} max={today()} onChange={on('birthDate')} /></label>
      <label>Sexe<select value={f.gender} onChange={on('gender')}><option value="">—</option><option value="m">Garçon</option><option value="f">Fille</option></select></label>
      <label>Téléphone (format international)<input inputMode="tel" placeholder="+218 91 234 5678" value={f.phone} onChange={on('phone')} /></label>
      <label>Date d’adhésion (تاريخ الإنخراط)<input type="date" value={f.joinedAt} onChange={on('joinedAt')} /></label>
      <label>Début du hifdh (تاريخ بداية الحفظ)<input type="date" value={f.hifdhStartedAt} onChange={on('hifdhStartedAt')} /></label>
      <label className="span-all">Participations précédentes à des concours<textarea rows={2} value={f.pastCompetitions} onChange={on('pastCompetitions')} /></label>
    </>
  );
}

function StudentsTab({ api, org, canEdit, isGlobalAdmin }: { api: Api; org: OrgSummary; canEdit: boolean; isGlobalAdmin: boolean }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [classId, setClassId] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
      let r = await api.createStudent(org.id, inputOf(form), newClasses, false);
      if ('duplicates' in r) {
        const names = r.duplicates.map((d) => `${d.fullName} (fils de ${d.fatherName || '—'})${d.status === 'left' ? ' — sorti' : ''}`).join('\n');
        if (!window.confirm(`Un élève porte déjà ce nom et ce prénom du père :\n\n${names}\n\nCréer quand même une nouvelle fiche ?`)) return;
        r = await api.createStudent(org.id, inputOf(form), newClasses, true);
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
          <input placeholder="Rechercher (nom, père, téléphone)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un élève" />
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} /> Élèves sortis</label>
          {canEdit && !showLeft && <button className="btn small" onClick={() => setAdding(!adding)}>{adding ? 'Annuler' : '+ Ajouter un élève'}</button>}
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
            <label className="check span-all"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              Les parents ont autorisé l’enregistrement des informations de l’enfant (nom, âge, téléphone, résultats).</label>
            <button className="btn" disabled={!consent}>Créer la fiche</button>
          </form>
        )}
        {msg && <p className="error" role="alert">{msg}</p>}
        {list.error && <p className="error">{list.error}</p>}
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Élève</th><th>Âge</th><th>Téléphone</th><th>Classes</th><th>Compte</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className={s.id === selected ? 'sel' : ''}>
                  <td><button className="link" onClick={() => setSelected(s.id === selected ? null : s.id)}>{s.fullName}</button>
                    {s.fatherName && <span className="muted small"> · ابن {s.fatherName}</span>}</td>
                  <td className="num">{s.age ?? '—'}</td>
                  <td className="nowrap">{s.phone ? <>{s.phone} <span className={`chip ${s.phoneVerified ? 'ok' : 'wait'}`}>{s.phoneVerified ? 'vérifié' : 'à vérifier'}</span></> : '—'}</td>
                  <td>{s.classes.map((c) => c.name).join(', ') || '—'}</td>
                  <td>{s.linked ? <span className="chip ok">lié</span> : <span className="chip off">non lié</span>}</td>
                </tr>
              ))}
              {list.data && students.length === 0 && <tr><td colSpan={5} className="muted">{showLeft ? 'Aucun élève sorti.' : 'Aucun élève à afficher.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <StudentFiche key={sel.id} api={api} org={org} student={sel} classes={classes.data ?? []} canEdit={canEdit} isGlobalAdmin={isGlobalAdmin}
        onClose={() => setSelected(null)} onChange={() => { list.reload(); classes.reload(); }} />}
    </div>
  );
}

function StudentFiche({ api, org, student: s, classes, canEdit, isGlobalAdmin, onClose, onChange }: {
  api: Api; org: OrgSummary; student: Student; classes: OrgClass[]; canEdit: boolean; isGlobalAdmin: boolean; onClose: () => void; onChange: () => void;
}) {
  const [form, setForm] = useState<Form>(formOf(s));
  const [msg, setMsg] = useFlash(5000);
  const [phoneCode, setPhoneCode] = useState<{ code: string; phone: string; expiresAt: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [link, setLink] = useState<{ code: string; expiresAt: string } | null>(null);
  const run = (fn: () => Promise<unknown>, ok?: string) => fn().then(() => { if (ok) setMsg(ok); onChange(); }, (e: Error) => setMsg(e.message));
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
        <button className="btn ghost icon" onClick={onClose} aria-label="Fermer">✕</button>
      </div>
      {msg && <p className="error" role="alert">{msg}</p>}
      <p className="muted small">Autorisation des parents : {s.guardianConsentAt ? `recueillie le ${new Date(s.guardianConsentAt).toLocaleDateString('fr-FR')}` : 'non enregistrée'}</p>

      {canEdit ? (
        <form className="invite-form" onSubmit={save}>
          <StudentFields f={form} set={setForm} />
          <button className="btn">Enregistrer</button>
        </form>
      ) : (
        <ul className="list plain">
          <li><span>Téléphone</span><span>{s.phone ?? '—'}</span></li>
          <li><span>Adhésion</span><span>{fmtDay(s.joinedAt)}</span></li>
          <li><span>Début du hifdh</span><span>{fmtDay(s.hifdhStartedAt)}</span></li>
        </ul>
      )}

      <h3>Téléphone</h3>
      {!s.phone ? <p className="muted small">Aucun numéro enregistré.</p> : (
        <>
          <p>{s.phone} <span className={`chip ${s.phoneVerified ? 'ok' : 'wait'}`}>{s.phoneVerified ? 'vérifié' : 'à vérifier'}</span></p>
          {!s.phoneVerified && (
            <>
              <button className="btn ghost small" onClick={() => run(async () => setPhoneCode(await api.studentPhoneCode(org.id, s.id)))}>Générer un code de vérification</button>
              {phoneCode && phoneCode.phone === s.phone && (
                <div className="created">
                  <p>Envoyez ce code à l’élève par WhatsApp, puis saisissez ci-dessous le code qu’il vous communique (valable 15 min, 5 essais).</p>
                  <p><strong className="code mono">{phoneCode.code}</strong></p>
                  <a className="btn small" href={waLink(phoneCode.phone, codeMsg(phoneCode.code))} target="_blank" rel="noopener">Envoyer par WhatsApp</a>
                  <div className="inline-form">
                    <input inputMode="numeric" maxLength={6} placeholder="Code reçu de l’élève" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Code communiqué par l’élève" />
                    <button className="btn small" onClick={() => run(async () => { await api.verifyStudentPhone(org.id, s.id, typed); setPhoneCode(null); setTyped(''); }, 'Numéro vérifié.')}>Valider</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {canEdit && (
        <>
          <h3>Compte de l’élève</h3>
          <p>{s.linked ? <span className="chip ok">compte lié</span> : <span className="chip off">aucun compte lié</span>}</p>
          {s.linked ? (
            <button className="btn ghost small danger-text" onClick={() => window.confirm('Détacher le compte de cette fiche ?') && run(() => api.unlinkStudent(org.id, s.id), 'Compte détaché.')}>Détacher le compte</button>
          ) : s.status === 'active' && (
            <>
              <p className="muted small">Le parent crée un compte pour son enfant, puis saisit ce code dans l’application pour le rattacher à la fiche.</p>
              <button className="btn ghost small" onClick={() => run(async () => setLink(await api.studentLinkCode(org.id, s.id)))}>Générer un code de liaison</button>
              {link && (
                <div className="created">
                  <p><strong className="code mono">{link.code}</strong> <span className="muted small">valable 7 jours, usage unique</span></p>
                  {s.phone && <a className="btn small" href={waLink(s.phone, linkMsg(link.code))} target="_blank" rel="noopener">Envoyer par WhatsApp</a>}
                </div>
              )}
            </>
          )}

          <h3>Classes</h3>
          {classes.length === 0 ? <p className="muted small">Créez d’abord une classe (onglet « Classes »).</p> : classes.map((c) => (
            <label key={c.id} className="check"><input type="checkbox" checked={s.classes.some((k) => k.id === c.id)}
              onChange={(e) => run(() => api.setClassStudent(org.id, c.id, s.id, e.target.checked))} /> {c.name}</label>
          ))}

          <h3>Archivage</h3>
          {s.status === 'active' ? (
            <>
              <p className="muted small">Un élève qui quitte l’établissement est archivé, jamais supprimé : ses données sont conservées au moins 5 ans.</p>
              <button className="btn ghost small danger-text" onClick={() => window.confirm(`Marquer ${s.fullName} comme sorti de l’établissement ?\nSa fiche sera conservée 5 ans.`) && run(() => api.leaveStudent(org.id, s.id), 'Élève marqué comme sorti.')}>Marquer comme sorti</button>
            </>
          ) : (
            <>
              <p className="muted small">Sorti le {fmtDay(s.leftAt)} · conservation jusqu’au {fmtDay(s.retainUntil)}.</p>
              <div className="row-actions">
                <button className="btn ghost small" onClick={() => run(() => api.restoreStudent(org.id, s.id), 'Élève réintégré.')}>Réintégrer</button>
                {isGlobalAdmin && (
                  <button className="btn ghost small danger-text" disabled={!retainOver} title={retainOver ? undefined : 'La durée de conservation n’est pas écoulée.'}
                    onClick={() => window.confirm(`Supprimer DÉFINITIVEMENT la fiche de ${s.fullName} ? Cette action est irréversible.`) && run(async () => { await api.deleteStudent(org.id, s.id); onClose(); }, 'Fiche supprimée.')}>Supprimer définitivement</button>
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
            <span className="small">{c.teachers.length === 0 ? <span className="muted">Aucun enseignant</span> : c.teachers.map((t) => (
              <span key={t.userId} className="chip ok">{t.displayName}{canEdit && <button className="link" aria-label={`Retirer ${t.displayName}`}
                onClick={() => api.setClassTeacher(org.id, c.id, t.userId, false).then(list.reload, fail)}> ✕</button>}</span>
            ))}</span>
            {canEdit && (
              <div className="row-actions">
                <select aria-label="Affecter un enseignant" value="" onChange={(e) => e.target.value && api.setClassTeacher(org.id, c.id, e.target.value, true).then(list.reload, fail)}>
                  <option value="">+ Enseignant…</option>
                  {teachers.filter((t) => !c.teachers.some((x) => x.userId === t.userId)).map((t) => <option key={t.userId} value={t.userId}>{t.displayName}</option>)}
                </select>
                <button className="btn ghost small" onClick={() => { const n = window.prompt('Nouveau nom de la classe', c.name); if (n?.trim()) api.renameClass(org.id, c.id, n.trim()).then(list.reload, fail); }}>Renommer</button>
                <button className="btn ghost small danger-text" onClick={() => window.confirm(`Supprimer la classe « ${c.name} » ? Les fiches des élèves sont conservées.`) && api.deleteClass(org.id, c.id).then(list.reload, fail)}>Supprimer</button>
              </div>
            )}
          </div>
        ))}
        {list.data?.length === 0 && <p className="muted">Aucune classe{canEdit ? ' : créez la première ci-dessous.' : ' ne vous est affectée.'}</p>}
      </div>
      {canEdit && (
        <form className="card inline-form" onSubmit={(e) => { e.preventDefault(); api.createClass(org.id, name.trim()).then(() => { setName(''); list.reload(); }, fail); }}>
          <input placeholder="Nom de la nouvelle classe (ex. فوج 1)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} aria-label="Nom de la nouvelle classe" />
          <button className="btn">Créer la classe</button>
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
  const [msg, setMsg] = useFlash();
  const fail = (e: Error) => setMsg(e.message);
  return (
    <>
      <p className="muted small">La personne doit d’abord avoir créé son compte (application ou page de connexion) avec cet e-mail.</p>
      <form className="card invite-form" onSubmit={(e) => { e.preventDefault(); api.addOrgMember(org.id, email.trim(), role).then(() => { setEmail(''); list.reload(); }, fail); }}>
        <label>E-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@gmail.com" /></label>
        <label>Rôle<select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
          <option value="teacher">{ROLE.teacher}</option><option value="admin">{ROLE.admin}</option></select></label>
        <button className="btn">Ajouter à l’équipe</button>
      </form>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Personne</th><th>Rôles</th><th /></tr></thead>
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
            {list.data && list.data.length === 0 && <tr><td colSpan={3} className="muted">Aucun membre dans l’équipe.</td></tr>}
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
      <label>Nom<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value as OrgType)}>
        <option value="association">{ORG_TYPE.association}</option><option value="mosque">{ORG_TYPE.mosque}</option></select></label>
      <label>Adresse (مقر الإدارة)<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
      <label>Seuil « page à reprendre »<input type="number" min={1} max={20} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        <span className="muted small">Nombre d’ayat « acquis avec erreur » sur une même page à partir duquel la page est à reprendre.</span></label>
      <button className="btn">Enregistrer</button>
      {msg && <p className="error span-all" role="alert">{msg}</p>}
    </form>
  );
}
