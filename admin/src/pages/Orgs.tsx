import { FormEvent, useState } from 'react';
import { t } from '../i18n';
import { useAsync, useFlash } from '../components';
import type { Api, OrgSummary, OrgType, User } from '../types';
import OrgView from './OrgView';
import { ORG_TYPE } from './orgLabels';

export default function Orgs({ api, me }: { api: Api; me: User }) {
  const list = useAsync(() => api.myOrgs(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<OrgType>('association');
  const [address, setAddress] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [msg, setMsg] = useFlash();
  const isGlobal = me.role === 'admin';
  const orgs = list.data ?? [];
  const open = orgs.find((o) => o.id === openId);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const o = await api.createOrg({ name: name.trim(), type, address: address.trim(), ...(adminEmail.trim() ? { adminEmail: adminEmail.trim() } : {}) });
      setName(''); setAddress(''); setAdminEmail('');
      setMsg(`Établissement « ${o.name} » créé.`);
      list.reload();
    } catch (err) { setMsg((err as Error).message); }
  }

  if (open) return <OrgView api={api} org={open} isGlobalAdmin={isGlobal} onBack={() => { setOpenId(null); list.reload(); }} onChanged={list.reload} />;

  return (
    <>
      <h1>{t('Établissements')}</h1>
      <p className="muted lead">{t('Une association (جمعية) ou une mosquée (جامع) regroupe des classes (قاعة / حلقة / فوج), une équipe (إداري، مدرس) et les fiches de ses élèves (طالب).')}</p>
      {isGlobal && (
        <form className="card invite-form" onSubmit={create}>
          <label>{t('Nom')}<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('جامع النور')} /></label>
          <label>{t('Type')}<select value={type} onChange={(e) => setType(e.target.value as OrgType)}>
            <option value="association">{ORG_TYPE.association}</option><option value="mosque">{ORG_TYPE.mosque}</option></select></label>
          <label>{t('Adresse (مقر الإدارة)')}<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
          <label>{t('E-mail du responsable')}<input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder={t('optionnel — compte existant')} /></label>
          <button className="btn">{t('Créer l’établissement')}</button>
        </form>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
      {list.error && <p className="error">{list.error}</p>}
      <div className="grid">
        {orgs.map((o: OrgSummary) => (
          <div key={o.id} className="card group-card">
            <button className="link big" onClick={() => setOpenId(o.id)}>{o.name}</button>
            <span className="muted">{ORG_TYPE[o.type]}</span>
            <span className="muted small">{o.address || 'Adresse non renseignée'}</span>
            <span>{o.studentCount} élève{o.studentCount > 1 ? 's' : ''} · {o.classCount} classe{o.classCount > 1 ? 's' : ''}</span>
          </div>
        ))}
        {list.data && orgs.length === 0 && <p className="muted">Aucun établissement{isGlobal ? ' : créez le premier ci-dessus.' : '.'}</p>}
      </div>
    </>
  );
}
