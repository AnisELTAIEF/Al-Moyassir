import { SURAHS, TOTAL_AYAHS } from './data/surahs';
import type { ImportItem, AyahProgress, UserStats } from './types';

export const pct = (part: number, total = TOTAL_AYAHS) => (total === 0 ? 0 : (part * 100) / total);

export const fmtPct = (part: number, total = TOTAL_AYAHS) => {
  const v = pct(part, total);
  return `${v.toFixed(v < 10 && v > 0 ? 1 : 0).replace('.', ',')} %`;
};

export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function sinceLabel(iso: string | null, now = new Date()): string {
  const d = daysSince(iso, now);
  if (d === null) return 'jamais';
  if (d <= 0) return 'aujourd’hui';
  if (d === 1) return 'hier';
  return `il y a ${d} j`;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

/** Membres sans activité depuis `days` jours (ou jamais actifs). */
export const inactiveMembers = (members: UserStats[], days = 7, now = new Date()) =>
  members.filter((m) => {
    const d = daysSince(m.lastActivity, now);
    return d === null || d >= days;
  });

/** Nombre d'ayat appris par sourate (index 0..113). */
export function memorizedPerSurah(items: AyahProgress[]): number[] {
  const counts = new Array<number>(114).fill(0);
  for (const p of items) if (p.status === 'memorized') counts[p.surah - 1]++;
  return counts;
}

export const surahRatios = (items: AyahProgress[]) => memorizedPerSurah(items).map((c, i) => c / SURAHS[i].ayahs);

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function membersCsv(members: UserStats[]): string {
  const head = ['Nom', 'E-mail', 'Rôle', 'Ayat appris', 'Ayat en cours', '% du Coran', 'Dernière activité'];
  const rows = members.map((m) => [
    m.displayName, m.email, m.role === 'admin' ? 'admin' : 'utilisateur', m.memorized, m.learning,
    pct(m.memorized).toFixed(2), m.lastActivity ?? '',
  ]);
  // BOM pour qu'Excel lise correctement l'UTF-8 (accents, arabe).
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function downloadCsv(name: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Résultat d'un import en CSV (avec les codes d'invitation, à transmettre si l'e-mail n'est pas parti). */
export function importResultCsv(items: ImportItem[]): string {
  const ACTION: Record<ImportItem['action'], string> = {
    added: 'ajouté', updated: 'mis à jour', invited: 'invité', unchanged: 'inchangé', error: 'erreur',
  };
  const head = ['Ligne', 'Nom', 'E-mail', 'Groupe', 'Rôle', 'Résultat', 'Détail', 'Code', 'Lien'];
  const rows = items.map((i) => [
    i.line, i.name ?? '', i.email ?? '', i.group ?? '', i.role === 'admin' ? 'admin' : i.role ? 'membre' : '',
    ACTION[i.action], i.message, i.code ?? '', i.link ?? '',
  ]);
  return '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}

/**
 * Lit un fichier texte importé : UTF-8 par défaut, sinon Windows-1252 (CSV enregistré par
 * une ancienne version d'Excel), repéré aux caractères de remplacement.
 */
export async function readTextFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}
