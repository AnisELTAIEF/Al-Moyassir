import json,re,html
q=json.load(open('t14.json'))
H=json.load(open('hafs.json'))['verses']
hafs_text={v['verse_key']:v['text_imlaei'] for v in H}
ik={t['verse_key']:t['text'] for v in q.values() for t in v}
KEEP=set('ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآىةؤئ')
def norm(t):
    t=re.sub('[أإآٱ]','ا',t).replace('ى','ي').replace('ة','ه')
    return ''.join(ch for ch in t if ch in KEEP or ch==' ')
def stem(w):
    if len(w)>3 and w[0] in 'وف': w=w[1:]
    for p in ('بال','كال','فال','لل','ال'):
        if w.startswith(p) and len(w)-len(p)>=2: return w[len(p):]
    return w
STOP={'الله','لا','الا','من','في','ما','ان','هو','على','الي','عن','ذلك','الذين','قال','كان','لم','قد','ثم','او','اذا','هم','به','لهم','له'}
def words(t): return [stem(w) for w in norm(t).split() if len(w)>1 and w not in STOP]
ISNAD=re.compile(r'حدثنا|أخبرنا|حدثني|أنبأنا|سمعت|رواه|إسناد|أخرجه|طريق أخرى|حديث آخر|ورواه|مرفوعا|موقوفا')
EXPL=re.compile(r'^(يعني|ومعنى|معنى|والمعنى|يقول تعالى|يقول الله تعالى|وقوله|قوله|ثم قال تعالى|وقال تعالى|أي|يخبر تعالى|يأمر تعالى|ينهى تعالى|يذكر تعالى|يمتن تعالى|هذا|وهذه|ثم أخبر|ثم قال)')
def paragraphs(h):
    out=[]
    for m in re.finditer(r'<p[^>]*>(.*?)</p>',h,re.S):
        inner=m.group(1)
        quotes=' '.join(re.findall(r'<span class="arabic qpc-hafs">(.*?)</span>',inner,re.S))
        red=sum(len(x) for x in re.findall(r'<span class="red">(.*?)</span>',inner,re.S))
        inner=re.sub(r'<span class="reference brown">.*?</span>','',inner,flags=re.S)
        txt=html.unescape(re.sub('<[^>]+>','',inner))
        txt=re.sub(r'\s+',' ',txt).strip()
        txt=re.sub(r'\s+([،,.:؛؟])',r'\1',txt)
        if txt: out.append(dict(text=txt,quotes=quotes,red=red))
    if not out:
        t=re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>','',h))).strip()
        if t: out.append(dict(text=t,quotes='',red=0))
    return out
def score(p, aw, first=(), idx=0):
    t=p['text']; s=0.0
    qw=set(words(p['quotes']))
    s+=3*min(1,len(qw & aw)/max(1,len(aw)))
    head=set(words(t[:140]))
    s+=3*min(1,len(head & aw)/max(1,min(len(aw),4)))
    if first and set(first) & (qw|head): s+=1
    m=re.match(r'^\(?\s*([^:()]{2,30}?)\s*\)?\s*:',t)
    if m and set(words(m.group(1))) & aw: s+=2.5
    if EXPL.match(t): s+=2
    if ' أي:' in t or ' أي :' in t or t.startswith('أي'): s+=1.5
    s-=1.2*len(ISNAD.findall(t))
    s-=3*p['red']/max(1,len(t))
    bare=re.sub(r'\([^)]*\)','',t)
    if len(bare.strip(' .،:'))<40: s-=4
    if t.rstrip().endswith(':'): s-=2
    if re.search(r'تفسير سورة|وهي مكية|وهي مدنية|ذكروا أن|ذكر ما ورد في فضلها',t[:80]): s-=3
    if 'حرف' in t and 'كلمة' in t and 'آية' in t: s-=3
    if len(t)>1500: s-=1
    s-=0.01*idx
    return s
def clip(t, n=650):
    if len(t)<=n: return t
    cut=t[:n]; k=max(cut.rfind('. '),cut.rfind('.'),cut.rfind('؛'),cut.rfind('،'))
    return (cut[:k+1] if k>n*0.5 else cut).rstrip()+' …'
def source_for(key):
    c,a=map(int,key.split(':'))
    while a>=1:
        if f'{c}:{a}' in ik: return f'{c}:{a}'
        a-=1
    return None
def explain(hkeys, maxn=2):
    aw=set(w for k in hkeys for w in words(hafs_text[k]))
    first=tuple(words(hafs_text[hkeys[0]])[:2])
    cands=[];seen=set()
    srcs=[]
    for k in hkeys:
        if k in ik: srcs.append(k)
        else:
            # ayah sans entrée propre : passage voisin (avant et après)
            c,a=map(int,k.split(':'))
            srcs+= [x for x in (source_for(k), f'{c}:{a+1}') if x in ik]
    for src in srcs:
        if src in seen: continue
        seen.add(src)
        for i,p in enumerate(paragraphs(ik[src])): cands.append((score(p,aw,first,i),src,i,p['text']))
    cands.sort(key=lambda x:-x[0])
    best=[c for c in cands if c[0]>1][:maxn] or cands[:1]
    if len(best)==2 and (best[1][0]<best[0][0]-3 or best[1][0]<2.5): best=best[:1]
    best.sort(key=lambda x:(x[1].split(':')[0], int(x[1].split(':')[1]), x[2]))
    return [clip(b[3]) for b in best], [round(b[0],1) for b in best]
if __name__=='__main__':
    for k in [['1:2'],['2:255'],['2:2'],['112:1'],['36:1','36:2'],['18:10'],['2:183'],['24:35'],['5:97'],['103:1'],['2:286']]:
        e,sc=explain(k); print('=====',k,sc)
        for x in e: print('  -',x[:700]); print()
