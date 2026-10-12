import json, urllib.request, concurrent.futures as cf, sys, os, time
def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"curl/8.5.0","Accept":"application/json"}), timeout=60) as r: return json.load(r)
        except Exception as e: time.sleep(2*(i+1)); err=e
    raise err
def chapter(tid, ch):
    out=[]; page=1
    while True:
        d=get(f"https://api.quran.com/api/v4/tafsirs/{tid}/by_chapter/{ch}?per_page=50&page={page}")
        out+=d['tafsirs']
        p=d['pagination']
        if not p.get('next_page'): break
        page=p['next_page']
    return ch,out
for tid in (14,16):
    res={}
    with cf.ThreadPoolExecutor(4) as ex:
        for ch,out in ex.map(lambda c: chapter(tid,c), range(1,115)): res[ch]=out
    json.dump(res, open(f't{tid}.json','w'), ensure_ascii=False)
    print(tid, sum(len(v) for v in res.values()))
