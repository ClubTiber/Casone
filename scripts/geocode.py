#!/usr/bin/env python3
"""Geocodifica gli indirizzi delle case senza coordinate esatte (Nominatim/OSM).

Uso:  python3 scripts/geocode.py QUERIES.json CACHE.json

QUERIES.json: lista di {"id", "indirizzo", "comune", "prov", "lat", "lon"}
(lat/lon = centro del comune, usato per scartare risultati lontani).
Rispetta la policy di Nominatim: 1 richiesta al secondo, User-Agent esplicito.
"""
import json, math, os, re, sys, time
import requests

UA = "Casone/1.0 (elenco case per gruppi; uso non commerciale)"

def hav(a, b, c, d):
    R, t = 6371, math.pi / 180
    x, y = (c - a) * t, (d - b) * t
    q = math.sin(x / 2) ** 2 + math.cos(a * t) * math.cos(c * t) * math.sin(y / 2) ** 2
    return 2 * R * math.asin(math.sqrt(q))

def clean_street(addr, comune):
    a = addr or ""
    a = re.sub(r"\(.*?\)", "", a)
    a = a.split(",")[0] if comune and comune.lower() in a.lower() else a
    a = re.sub(r"\bn\.?\s*(?=\d)", "", a, flags=re.I)
    a = re.sub(r"\b(loc\.|località|frazione|fraz\.)\s*", "", a, flags=re.I)
    a = re.sub(r"\s+", " ", a).strip(" ,-")
    return a

def query(params):
    r = requests.get("https://nominatim.openstreetmap.org/search", params={**params, "format": "jsonv2", "countrycodes": "it", "limit": 3},
                     headers={"User-Agent": UA}, timeout=30)
    time.sleep(1.1)
    return r.json() if r.status_code == 200 else []

def main():
    qs = json.load(open(sys.argv[1], encoding="utf-8"))
    cpath = sys.argv[2]
    cache = json.load(open(cpath, encoding="utf-8")) if os.path.exists(cpath) else {}
    for i, q in enumerate(qs):
        if q["id"] in cache:
            continue
        street = clean_street(q.get("indirizzo"), q.get("comune"))
        res, how = None, None
        tries = []
        if street and not street.lower().startswith(q["comune"].lower()):
            tries.append(("indirizzo", {"street": street, "city": q["comune"]}))
            tries.append(("testo", {"q": f"{street}, {q['comune']}"}))
        for label, p in tries:
            try:
                for cand in query(p):
                    lat, lon = float(cand["lat"]), float(cand["lon"])
                    if q.get("lat") is None or hav(q["lat"], q["lon"], lat, lon) < 18:
                        res, how = (round(lat, 6), round(lon, 6)), label
                        break
            except Exception as e:  # noqa
                print("errore", q["id"], e)
            if res:
                break
        cache[q["id"]] = {"lat": res[0], "lon": res[1], "come": how, "street": street} if res else {"street": street, "come": None}
        print(i, q["id"], street, "->", res, flush=True)
        if i % 10 == 0:
            json.dump(cache, open(cpath, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(cache, open(cpath, "w", encoding="utf-8"), ensure_ascii=False, indent=0)

if __name__ == "__main__":
    main()
