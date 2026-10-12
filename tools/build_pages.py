"""Débuts des 604 pages du mushaf (KFGQPC « Qaloon » v10, مصحف المدينة برواية قالون), alignés sur le texte libyen.
Usage: python3 -I build_pages.py <QaloonData_v10.json> <quran_qalun.json> <sortie mushaf_pages.json>
Source des données : https://github.com/thetruetruth/quran-data-kfgqpc (dossier qaloon/data).

Les deux éditions ont les mêmes mots (77 430, sourate par sourate) mais pas toujours le même
découpage en ayat (15 sourates diffèrent). On aligne donc chaque début de page par sa position
en mots dans la sourate, puis on prend l'ayah libyen qui commence le plus près.
"""
import json, re, sys

kfg = json.load(open(sys.argv[1], encoding="utf-8"))
ours = json.load(open(sys.argv[2], encoding="utf-8"))
isword = lambda w: re.search(r"[ء-يٱ]", w) is not None
first = lambda p: int(str(p).replace("–", "-").split("-")[0])

off, cur, starts = {}, {}, {}
for x in kfg:
    s = x["sura_no"]
    off[(s, x["aya_no"])] = cur.get(s, 0)
    cur[s] = cur.get(s, 0) + sum(1 for w in x["aya_text"].split() if isword(w))
for x in kfg:
    starts.setdefault(first(x["page"]), (x["sura_no"], off[(x["sura_no"], x["aya_no"])]))

ostart = {}
for s in ours["surahs"]:
    o, L = 0, []
    for a in s["ayahs"]:
        L.append(o)
        o += sum(1 for w in a.split() if isword(w))
    ostart[s["n"]] = L
    assert o == cur[s["n"]], f"sourate {s['n']} : nombre de mots différent"

pages, inexact = [], 0
for p in range(1, max(starts) + 1):
    s, o = starts[p]
    L = ostart[s]
    best = min(range(len(L)), key=lambda i: abs(L[i] - o))
    inexact += L[best] != o
    pages.append([s, best + 1])
assert pages == sorted(pages) and len({tuple(p) for p in pages}) == len(pages)
json.dump({"source": "KFGQPC Qaloon v10 (مصحف المدينة برواية قالون) — débuts de page alignés mot à mot sur le texte libyen",
           "pages": pages}, open(sys.argv[3], "w"), ensure_ascii=False, separators=(",", ":"))
print("pages:", len(pages), "— débuts arrondis à l'ayah le plus proche:", inexact)
