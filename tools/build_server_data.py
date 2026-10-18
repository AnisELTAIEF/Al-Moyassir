#!/usr/bin/env python3
"""Génère server/sql/009_reference_data.sql à partir des données de l'application.

Le serveur a besoin de savoir où commencent les 604 pages du mushaf et les 60 ahzab pour calculer
la mémorisation « globale » et « successive » (voir docs/PLAN-EXECUTION.md, lot B). Ces données
viennent des fichiers de l'app (source de vérité) ; un test serveur vérifie qu'elles n'ont pas dérivé.

Règle du début d'un hizb (identique à l'app, QuranRepository.hizbStart) : le hizb h commence au
« huitième » numéro (h-1)*8 de divisions.json ; si ce point tombe en milieu d'ayah (mot > 1), le
premier ayah entier du hizb est l'ayah suivant.

Usage : python3 tools/build_server_data.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'mobile' / 'assets' / 'data'
OUT = ROOT / 'server' / 'sql' / '009_reference_data.sql'


def main() -> None:
    quran = json.loads((DATA / 'quran_qalun.json').read_text(encoding='utf-8'))
    counts = {s['n']: len(s['ayahs']) for s in quran['surahs']}
    assert len(counts) == 114 and sum(counts.values()) == 6214, 'texte incomplet'

    pages = json.loads((DATA / 'mushaf_pages.json').read_text(encoding='utf-8'))['pages']
    assert len(pages) == 604, f'{len(pages)} pages au lieu de 604'

    thumun = json.loads((DATA / 'divisions.json').read_text(encoding='utf-8'))['thumun']
    assert len(thumun) == 480, f'{len(thumun)} huitièmes au lieu de 480'

    def next_ayah(s: int, a: int) -> tuple[int, int]:
        return (s, a + 1) if a < counts[s] else (s + 1, 1)

    hizb_starts = []
    for h in range(1, 61):
        s, a, word = thumun[(h - 1) * 8]
        hizb_starts.append(next_ayah(s, a) if word > 1 else (s, a))

    lines = [
        '-- Données de référence du mushaf de Qalun (débuts de page et de hizb).',
        '-- GÉNÉRÉ par tools/build_server_data.py depuis mobile/assets/data : ne pas modifier à la main.',
        '',
        'CREATE TABLE IF NOT EXISTS mushaf_pages (',
        '  page  SMALLINT UNSIGNED NOT NULL PRIMARY KEY,',
        '  surah TINYINT UNSIGNED  NOT NULL,',
        '  ayah  SMALLINT UNSIGNED NOT NULL',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
        '',
        'CREATE TABLE IF NOT EXISTS hizb_starts (',
        '  hizb  TINYINT UNSIGNED  NOT NULL PRIMARY KEY,',
        '  surah TINYINT UNSIGNED  NOT NULL,',
        '  ayah  SMALLINT UNSIGNED NOT NULL',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
        '',
        'INSERT INTO mushaf_pages (page, surah, ayah) VALUES',
        ',\n'.join(f'({i + 1},{s},{a})' for i, (s, a) in enumerate(pages)) + ';',
        '',
        'INSERT INTO hizb_starts (hizb, surah, ayah) VALUES',
        ',\n'.join(f'({i + 1},{s},{a})' for i, (s, a) in enumerate(hizb_starts)) + ';',
        '',
    ]
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)} : {len(pages)} pages, {len(hizb_starts)} ahzab')


if __name__ == '__main__':
    main()
