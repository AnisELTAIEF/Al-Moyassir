# Tafsir Ibn Kathir — génération de `mobile/assets/data/tafsir_ibn_kathir.json`

Source : texte arabe d'Ibn Kathir de quran.com (API v4, ressource 14), numérotation de Hafs.

1. `fetch.py` : télécharge le tafsir par sourate (`t14.json`) ; `hafs.json` = texte de Hafs
   (`https://api.quran.com/api/v4/quran/verses/imlaei`).
2. `align.py` : fait correspondre chaque ayah de Qalun (6214) aux ayat de Hafs (6236) en alignant
   le squelette des lettres → `qalun_to_hafs.json`.
3. `extract.py` + `build.py` : pour chaque ayah de Qalun, choisit au plus deux paragraphes
   d'Ibn Kathir qui commentent le plus directement ses mots (citation de l'ayah, « أي : », « يقول تعالى »…,
   en écartant chaînes de transmission et introductions). Les paragraphes sont recopiés sans
   modification (coupés à ~650 caractères avec « … »).

Le choix est automatique : il peut être imparfait pour les passages faits surtout de récits rapportés.
