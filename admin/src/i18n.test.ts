import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AR } from './i18n_ar';

// Pages et modules traduits : chaque t('…') doit avoir son entrée arabe (sinon le français s'afficherait en mode arabe).
const FILES = ['App.tsx', 'pages/Orgs.tsx', 'pages/OrgView.tsx', 'pages/StudentResults.tsx', 'pages/Follow.tsx', 'pages/OrgTools.tsx', 'export.ts'];
const EXTRA = ['Aperçu', 'Établissements', 'Utilisateurs', 'Invitations', 'Groupes', 'Import', 'Mes établissements', 'Mon établissement', 'Mes groupes', 'Élèves', 'Suivi (متابعة)', 'Classes', 'Équipe', 'Réglages',
  'Ce mois', 'Ce trimestre', 'Ce semestre', 'Cette année', 'Depuis toujours']; // libellés passés à t() par variable

describe('i18n du BO', () => {
  const keys = new Set<string>(EXTRA);
  for (const f of FILES) {
    for (const m of readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').matchAll(/\bt\('((?:[^'\\\n]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  }
  it('chaque texte traduisible a sa traduction arabe', () => {
    const missing = [...keys].filter((k) => /[A-Za-zÀ-ÿ]/.test(k) && !k.includes('@') && !AR[k]);
    expect(missing).toEqual([]);
  });
  it('les variables {…} sont conservées', () => {
    for (const [fr, ar] of Object.entries(AR)) for (const v of fr.matchAll(/\{(\w+)\}/g)) expect(ar, fr).toContain(`{${v[1]}}`);
  });
});
