"""Durée d'un MP3 sans dépendance : en-tête Xing/Info (VBR) sinon débit de la 1re trame (CBR)."""
import os, struct, sys

BR = {1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],  # MPEG-1 couche III
      2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]}       # MPEG-2/2.5 couche III
SR = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def duration(path):
    size = os.path.getsize(path)
    with open(path, 'rb') as f:
        head = f.read(200_000)
    i = 0
    if head[:3] == b'ID3':  # balise ID3v2 au début
        i = 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9])
        if i + 4 > len(head):
            with open(path, 'rb') as f:
                f.seek(i); head = head[:i] + f.read(200_000)
    start = i
    while i < len(head) - 4:
        h = struct.unpack('>I', head[i:i + 4])[0]
        if (h >> 21) & 0x7FF == 0x7FF and (h >> 17) & 3 == 1:  # synchro + couche III
            ver = (h >> 19) & 3
            bri, sri = (h >> 12) & 15, (h >> 10) & 3
            if ver != 1 and 0 < bri < 15 and sri < 3:
                sr = SR[ver][sri]
                spf = 1152 if ver == 3 else 576
                br = BR[1 if ver == 3 else 2][bri] * 1000
                frame = head[i:i + 200]
                for tag in (b'Xing', b'Info'):
                    j = frame.find(tag)
                    if j > 0 and struct.unpack('>I', frame[j + 4:j + 8])[0] & 1:
                        return struct.unpack('>I', frame[j + 8:j + 12])[0] * spf / sr
                return (size - i) * 8 / br
        i += 1
    raise ValueError(f'pas de trame MP3 : {path}')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(f'{duration(p):9.1f}  {p}')
