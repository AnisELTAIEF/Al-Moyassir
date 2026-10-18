"""Publie les enregistrements d'un récitateur (un fichier par sourate) pour l'app : NNN.mp3.

Reconnaît la sourate de chaque fichier par son numéro en tête (« 36- سورة يس.mp3 ») ou par son nom
(« سورة يس - كمال صميدة.mp3 »), puis copie les fichiers dans <dest>/<id>/001.mp3 … 114.mp3.
Un fichier qui n'est pas un MP3 (vidéo .mp4…) est converti avec ffmpeg s'il est installé, sinon ignoré.

  python3 tools/publish_reciter_audio.py --id kamel_smida --src "mp3/Kamel Smida" --list
  sudo python3 tools/publish_reciter_audio.py --id kamel_smida --src "/chemin/Kamel Smida" \\
       --dest /var/www/almoyassir-app/audio

--list : n'écrit rien, affiche la correspondance et la liste des sourates (pour mobile/assets/data/reciters.json).
--move : déplace au lieu de copier (pour ne pas occuper deux fois la place sur le disque).
--kbps 64 : réencode (ffmpeg, mono) — conseillé : ~300 kbit/s → 64 kbit/s, 5 fois moins à télécharger,
            sans perte audible pour une voix. Sans cette option, les MP3 sont copiés tels quels.
"""
import argparse, json, os, re, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
from mp3_duration import duration  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_EXT = ('.mp3', '.mp4', '.m4a', '.wav', '.ogg', '.opus', '.aac', '.webm')


def bare(s):
    """Sans voyelles ni signes : « الشُّورىٰ » → « الشوري »."""
    s = re.sub('[ً-ٰٟۖ-ۭـ]', '', s)
    for a, b in (('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ٱ', 'ا'), ('ى', 'ي'), ('ة', 'ه')):
        s = s.replace(a, b)
    return re.sub(r'\s+', ' ', s).strip()


def surah_names():
    q = json.load(open(os.path.join(ROOT, 'mobile/assets/data/quran_qalun.json'), encoding='utf-8'))
    return {bare(s['name']): s['n'] for s in q['surahs']}


def surah_of(name, names):
    m = re.match(r'\s*(\d{1,3})\s*[-_. ]', name)
    if m and 1 <= int(m.group(1)) <= 114:
        return int(m.group(1))
    m = re.search(r'سورة\s+(.+?)\s*(?:-|برواية|\[|\.\w+$)', name)
    if not m:
        return None
    n = bare(m.group(1))
    return names.get(n) or names.get(n.removeprefix('ال')) or names.get('ال' + n)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--id', required=True, help='identifiant du récitateur (minuscules, ex. kamel_smida)')
    ap.add_argument('--src', required=True, help='dossier des enregistrements')
    ap.add_argument('--dest', default='/var/www/almoyassir-app/audio')
    ap.add_argument('--list', action='store_true', help="ne rien écrire : afficher la correspondance")
    ap.add_argument('--move', action='store_true', help='déplacer au lieu de copier')
    ap.add_argument('--kbps', type=int, help='réencoder à ce débit (ffmpeg, mono), ex. 64')
    a = ap.parse_args()
    if not re.fullmatch(r'[a-z0-9_]+', a.id):
        sys.exit('--id : lettres minuscules, chiffres et _ uniquement')

    names = surah_names()
    found, unknown = {}, []
    for f in sorted(os.listdir(a.src)):
        if not f.lower().endswith(AUDIO_EXT):
            continue
        n = surah_of(f, names)
        if n is None:
            unknown.append(f)
        elif n in found:
            sys.exit(f'sourate {n} en double : « {found[n]} » et « {f} »')
        else:
            found[n] = f

    ffmpeg = shutil.which('ffmpeg')
    if a.kbps and not ffmpeg:
        sys.exit('--kbps demande ffmpeg (sudo apt install ffmpeg)')
    out = os.path.join(a.dest, a.id)
    if not a.list:
        os.makedirs(out, exist_ok=True)
    published, total = [], 0.0
    for n in sorted(found):
        src = os.path.join(a.src, found[n])
        dst = os.path.join(out, f'{n:03d}.mp3')
        if a.kbps:
            if not a.list:
                subprocess.run([ffmpeg, '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', f'{a.kbps}k', dst], check=True)
                os.chmod(dst, 0o644)
                if a.move:
                    os.remove(src)
            published.append(n)
            print(f'  {n:3d}  réencodé {a.kbps} kbit/s  {found[n]}')
            continue
        if not src.lower().endswith('.mp3'):
            if not ffmpeg:
                print(f'  {n:3d}  IGNORÉ (pas un MP3, ffmpeg absent) : {found[n]}')
                continue
            if not a.list:
                subprocess.run([ffmpeg, '-loglevel', 'error', '-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', dst], check=True)
            published.append(n)
            print(f'  {n:3d}  converti   {found[n]}')
            continue
        sec = duration(src)
        total += sec
        if not a.list:
            (shutil.move if a.move else shutil.copyfile)(src, dst)
            os.chmod(dst, 0o644)
        published.append(n)
        print(f'  {n:3d}  {int(sec // 60):4d} min  {found[n]}')

    for f in unknown:
        print(f'  ???  sourate non reconnue : {f}')
    missing = [n for n in range(1, 115) if n not in published]
    print(f'\n{len(published)} sourates, {total / 3600:.1f} h ; manquantes ({len(missing)}) : {missing}')
    print('\nsurahs pour reciters.json :')
    print(json.dumps(published))
    if not a.list:
        os.chmod(out, 0o755)
        print(f'\nPublié dans {out} → https://DOMAINE/audio/{a.id}/NNN.mp3')


if __name__ == '__main__':
    main()
