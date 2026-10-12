import json, gzip, collections
from extract import explain
m=json.load(open('qalun_to_hafs.json'))
out={'source':'Tafsir Ibn Kathir (texte arabe, quran.com, ressource 14) — extraits choisis automatiquement','surahs':[]}
weak=[]; n2=collections.Counter()
for c in range(1,115):
    arr=[]
    for i,hs in enumerate(m[str(c)]):
        keys=[f'{c}:{h}' for h in hs]
        e,sc=explain(keys)
        arr.append({'h':hs,'t':e})
        n2[len(e)]+=1
        if not sc or sc[0]<2: weak.append((c,i+1,sc))
    out['surahs'].append(arr)
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
open('tafsir_ibn_kathir.json','w').write(s)
print('size',len(s.encode())/1e6,'MB  gz',len(gzip.compress(s.encode()))/1e6,'MB', n2, 'weak',len(weak))
print(weak[:30])
