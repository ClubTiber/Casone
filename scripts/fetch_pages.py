#!/usr/bin/env python3
"""Scarica (con cache) tutte le schede sorgente delle case elencate in data/houses.json.

Uso:  python3 scripts/fetch_pages.py data/houses.json CACHE_DIR [--refresh]

Le pagine vengono salvate in CACHE_DIR/or/<id>.html e CACHE_DIR/cia/<id>.html.
Le richieste sono sequenziali-lente (pochi thread, pausa tra una e l'altra)
per non pesare sui portali.
"""
import json, os, sys, time, urllib.request, concurrent.futures as cf

UA = "Mozilla/5.0 (X11; Linux x86_64) CasoneBot/1.0 (+uso non commerciale)"

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa
            err = e
            time.sleep(2 * (i + 1))
    raise err

def main():
    src, cache = sys.argv[1], sys.argv[2]
    refresh = "--refresh" in sys.argv
    H = json.load(open(src, encoding="utf-8"))
    jobs = []
    for h in H:
        for f in h["fonti"]:
            d = os.path.join(cache, f["s"].lower())
            os.makedirs(d, exist_ok=True)
            p = os.path.join(d, f["id"] + ".html")
            if refresh or not os.path.exists(p):
                jobs.append((f["url"], p))
        for a in h.get("altri", []) or []:
            pass
    print(len(jobs), "pagine da scaricare", flush=True)

    def work(j):
        url, p = j
        try:
            b = get(url)
            open(p, "wb").write(b)
            time.sleep(0.4)
            return None
        except Exception as e:
            return f"{url}: {e}"

    errs = []
    with cf.ThreadPoolExecutor(4) as ex:
        for i, r in enumerate(ex.map(work, jobs)):
            if r: errs.append(r)
            if i % 50 == 0: print(i, flush=True)
    print("errori:", len(errs))
    for e in errs: print(" ", e)

if __name__ == "__main__":
    main()
