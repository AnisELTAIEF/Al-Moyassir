import { describe, expect, it } from 'vitest';
import { SURAHS, TOTAL_AYAHS } from './data/surahs';
import { daysSince, fmtPct, importResultCsv, inactiveMembers, membersCsv, readTextFile, sinceLabel, surahRatios } from './lib';
import type { AyahProgress, UserStats } from './types';

const now = new Date('2026-10-10T12:00:00Z');
const member = (over: Partial<UserStats>): UserStats => ({
  id: 'u', email: 'u@x.io', displayName: 'Test', role: 'user', status: 'active',
  memorized: 0, learning: 0, lastActivity: null, lastLoginAt: null, ...over,
});

describe('données', () => {
  it('114 sourates et 6214 ayat (numérotation Qalun)', () => {
    expect(SURAHS).toHaveLength(114);
    expect(SURAHS.reduce((a, s) => a + s.ayahs, 0)).toBe(TOTAL_AYAHS);
    expect(TOTAL_AYAHS).toBe(6214);
  });
});

describe('lib', () => {
  it('fmtPct', () => {
    expect(fmtPct(621.4)).toBe('10 %');
    expect(fmtPct(62)).toBe('1,0 %');
    expect(fmtPct(0)).toBe('0 %');
  });
  it('daysSince / sinceLabel', () => {
    expect(daysSince(null, now)).toBeNull();
    expect(sinceLabel('2026-10-10T08:00:00Z', now)).toBe('aujourd’hui');
    expect(sinceLabel('2026-10-09T08:00:00Z', now)).toBe('hier');
    expect(sinceLabel('2026-10-01T12:00:00Z', now)).toBe('il y a 9 j');
    expect(sinceLabel(null, now)).toBe('jamais');
  });
  it('inactiveMembers', () => {
    const ms = [
      member({ id: 'a', lastActivity: '2026-10-09T00:00:00Z' }),
      member({ id: 'b', lastActivity: '2026-09-20T00:00:00Z' }),
      member({ id: 'c', lastActivity: null }),
    ];
    expect(inactiveMembers(ms, 7, now).map((m) => m.id)).toEqual(['b', 'c']);
  });
  it('surahRatios', () => {
    const items: AyahProgress[] = [1, 2, 3, 4].map((a) => ({
      surah: 112, ayah: a, status: 'memorized', memorizedAt: null, lastReviewedAt: null, reviewCount: 0, updatedAt: '',
    }));
    const r = surahRatios(items);
    expect(r).toHaveLength(114);
    expect(r[111]).toBeCloseTo(4 / SURAHS[111].ayahs);
    expect(r[0]).toBe(0);
  });
  it('membersCsv échappe virgules et guillemets', () => {
    const csv = membersCsv([member({ displayName: 'Ali, "le" jeune', memorized: 10 })]);
    expect(csv.startsWith('﻿Nom,')).toBe(true);
    expect(csv).toContain('"Ali, ""le"" jeune"');
  });
});

describe('import', () => {
  it('résultat CSV : en-tête, codes, cellules protégées', () => {
    const csv = importResultCsv([
      { line: 2, email: 'a@b.tn', name: 'Ben Ali; Ahmed', group: 'G', role: 'admin', action: 'invited', message: 'Invité(e).', code: 'K7XQ-M2PA', link: 'https://x/invite/K7XQ-M2PA' },
      { line: 3, email: null, name: null, group: null, role: null, action: 'error', message: 'Adresse e-mail manquante.' },
    ]);
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toBe('Ligne;Nom;E-mail;Groupe;Rôle;Résultat;Détail;Code;Lien');
    expect(lines[1]).toContain('"Ben Ali; Ahmed"');
    expect(lines[1]).toContain('K7XQ-M2PA');
    expect(lines[2]).toContain('erreur');
  });
  it('fichier en Windows-1252 (ancien Excel) relu correctement', async () => {
    const bytes = new Uint8Array([0x45, 0x6c, 0xe8, 0x76, 0x65, 0x3b, 0x61, 0x40, 0x62, 0x2e, 0x74, 0x6e]); // « Elève;a@b.tn »
    expect(await readTextFile(new Blob([bytes]))).toBe('Elève;a@b.tn');
    expect(await readTextFile(new Blob(['Élève;a@b.tn']))).toBe('Élève;a@b.tn');
  });
});
