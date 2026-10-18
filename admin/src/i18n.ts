import { AR } from './i18n_ar';

/**
 * Langue du BO : arabe par défaut (D12), français au choix. La clé est le texte français ; sans traduction connue,
 * le français s'affiche (comme dans l'app). Un changement de langue recharge la page : toute l'interface est refaite.
 */
export type Lang = 'ar' | 'fr';
const KEY = 'hifidh-admin-lang';

function stored(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'fr' || v === 'ar' ? v : 'ar';
  } catch { return 'ar'; }
}
export const lang: Lang = stored();
export const isRtl = lang === 'ar';

if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
}

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* navigation privée : le choix ne sera pas mémorisé */ }
  location.reload();
}

/** Traduit une phrase ; les variables s'écrivent {nom}. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  let s = lang === 'ar' ? (AR[fr] ?? fr) : fr;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
