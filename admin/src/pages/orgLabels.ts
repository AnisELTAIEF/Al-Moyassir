import type { OrgType } from '../types';

export const ORG_TYPE: Record<OrgType, string> = { association: 'Association (جمعية)', mosque: 'Mosquée (جامع)' };
/** Libellé d'une classe selon le type d'établissement (association : قاعة / فوج ; mosquée : حلقة / فوج). */
export const classWord = (t: OrgType) => (t === 'mosque' ? 'Halqa / Fawj (حلقة / فوج)' : 'Salle / Fawj (قاعة / فوج)');
