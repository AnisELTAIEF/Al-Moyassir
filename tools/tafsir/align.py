import json, re, difflib, unicodedata
Q=json.load(open('/home/claude/fifidh/mobile/assets/data/quran_qalun.json'))['surahs']
H=json.load(open('hafs.json'))['verses']
hafs={}
for v in H:
    c,a=map(int,v['verse_key'].split(':')); hafs.setdefault(c,[]).append(v['text_imlaei'])
KEEP=set('بتثجحخدذرزسشصضطظعغفقكلمنهوي')
def norm(t):
    t=t.replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي')
    return ''.join(ch for ch in t if ch in KEEP)
def mapping(c):
    qa=[norm(x) for x in Q[c-1]['ayahs']]; ha=[norm(x) for x in hafs[c]]
    qs=''.join(qa); hs=''.join(ha)
    # bornes
    qb=[0]; [qb.append(qb[-1]+len(x)) for x in qa]
    hb=[0]; [hb.append(hb[-1]+len(x)) for x in ha]
    sm=difflib.SequenceMatcher(None, qs, hs, autojunk=False)
    # position q -> h via blocs
    pos=[None]*(len(qs)+1)
    for a,b,n in sm.get_matching_blocks():
        for k in range(n): pos[a+k]=b+k
    last=0
    for i in range(len(qs)+1):
        if pos[i] is None: pos[i]=last
        else: last=pos[i]
    pos[len(qs)]=len(hs)
    import bisect
    res=[]
    for i in range(len(qa)):
        s,e=pos[qb[i]],pos[qb[i+1]-1]+1 if qb[i+1]>qb[i] else pos[qb[i]]+1
        covered=[]
        for j in range(len(ha)):
            ov=min(e,hb[j+1])-max(s,hb[j])
            if ov>0 and (ov>=0.5*(hb[j+1]-hb[j]) or ov>=0.5*(e-s)): covered.append(j+1)
        if not covered:
            covered=[bisect.bisect_right(hb,s)]
        res.append(covered)
    return res, sm.ratio()
out={}; diff=0
for c in range(1,115):
    m,r=mapping(c); out[c]=m
    ident = len(m)==len(hafs[c]) and all(x==[i+1] for i,x in enumerate(m))
    if not ident or r<0.9:
        diff+=1; print(c, len(Q[c-1]['ayahs']), len(hafs[c]), round(r,3), [(i+1,x) for i,x in enumerate(m) if x!=[i+1]][:12])
json.dump(out, open('qalun_to_hafs.json','w'))
print('surahs with differences', diff)
