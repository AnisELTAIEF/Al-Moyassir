"""Génère les assets de l'app à partir de la release qalun-timing (voir README, section Données).
Usage: python3 -I build_data.py <dossier_donnees> <dossier_sortie>
<dossier_donnees> contient: reciters.json, canon/canon/NNN.json, ayahs/timings/<reciter>/ayahs.json
"""
import json, os, shutil, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, "timings"), exist_ok=True)

surahs = []
for n in range(1, 115):
    d = json.load(open(os.path.join(src, "canon", "canon", f"{n:03d}.json"), encoding="utf-8"))
    orn = {int(k): set(v) for k, v in d.get("ornaments", {}).items()}
    ayahs = []
    for a in range(1, len(d["ayahs"]) + 1):
        words = d["ayahs"][str(a)]
        keep = [w for i, w in enumerate(words, 1) if i not in orn.get(a, set())]
        ayahs.append(" ".join(keep))
    surahs.append({"n": n, "name": d["name"], "ayahs": ayahs})
# Marqueurs ۞ du mushaf libyen = huitièmes de hizb (athmān) : 60 hizb × 8, sauf le tout début.
# On les garde à part (le texte ne les contient pas) : [sourate, ayah, n° du mot devant lequel il se trouve].
thumun = [[1, 1, 1]]
for n in range(1, 115):
    d = json.load(open(os.path.join(src, "canon", "canon", f"{n:03d}.json"), encoding="utf-8"))
    for a in sorted(d.get("ornaments", {}), key=int):
        for i in sorted(d["ornaments"][a]):
            # n° du mot dans le texte sans ornement = position d'origine moins les ornements précédents
            before = sum(1 for j in d["ornaments"][a] if j < i)
            thumun.append([n, int(a), i - before])
assert len(thumun) == 480, len(thumun)
json.dump({"thumun": thumun}, open(os.path.join(out, "divisions.json"), "w"), separators=(",", ":"))
print("athman:", len(thumun), "-> hizb:", len(thumun) // 8, "juz:", len(thumun) // 16)

json.dump({"numbering": "qalun-libya-6214", "surahs": surahs},
          open(os.path.join(out, "quran_qalun.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("ayahs total:", sum(len(s["ayahs"]) for s in surahs))

counts = {s["n"]: len(s["ayahs"]) for s in surahs}
rec = json.load(open(os.path.join(src, "reciters.json"), encoding="utf-8"))["reciters"]
slim = []
for r in rec:
    t = json.load(open(os.path.join(src, "ayahs", "timings", r["id"], "ayahs.json"), encoding="utf-8"))
    # Garde-fou : une sourate dont les minutages ne couvrent pas tous les ayat du texte
    # est retirée du récitateur (sinon la lecture se désynchroniserait).
    dropped = [int(k) for k, v in t["surahs"].items() if len(v) != counts[int(k)]]
    for k in dropped:
        del t["surahs"][str(k)]
    if dropped:
        print("  ", r["id"], "sourates écartées (minutages incomplets):", sorted(dropped))
    item = {k: r[k] for k in ("id", "name", "source", "audio")}
    item["surahs"] = sorted(s for s in r["surahs"] if s not in dropped and str(s) in t["surahs"])
    slim.append(item)
    json.dump({"surahs": t["surahs"]}, open(os.path.join(out, "timings", r["id"] + ".json"), "w"),
              separators=(",", ":"))
# Nos propres enregistrements (tools/reciters_own.json), hébergés sur le serveur, sans minutages :
# l'app les joue sourate entière (voir tools/publish_reciter_audio.py).
slim += json.load(open(os.path.join(os.path.dirname(__file__), "reciters_own.json"), encoding="utf-8"))
json.dump(slim, open(os.path.join(out, "reciters.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("reciters:", len(slim))

# Table sourates (nom + nombre d'ayat) pour l'interface admin web.
if len(sys.argv) > 3:
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        f.write("// Généré par tools/build_data.py — numérotation Qalun (6214 ayat).\n")
        f.write("export const TOTAL_AYAHS = %d;\n" % sum(len(s["ayahs"]) for s in surahs))
        f.write("export const SURAHS: { n: number; name: string; ayahs: number }[] = [\n")
        for s in surahs:
            f.write('  { n: %d, name: "%s", ayahs: %d },\n' % (s["n"], s["name"], len(s["ayahs"])))
        f.write("];\n")

# Table des sourates pour la base MariaDB de l'API.
sql_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "sql", "002_surahs.sql")
rows = ",\n".join("(%d,'%s',%d)" % (s["n"], s["name"].replace("'", "''"), len(s["ayahs"])) for s in surahs)
with open(sql_path, "w", encoding="utf-8") as f:
    f.write("-- Nombre d'ayat par sourate (Qalun, 6214 au total). Généré par tools/build_data.py.\n"
            "INSERT INTO surahs (n, name, ayah_count) VALUES\n" + rows +
            "\nON DUPLICATE KEY UPDATE name = VALUES(name), ayah_count = VALUES(ayah_count);\n")
