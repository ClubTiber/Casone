#!/usr/bin/env bash
# Riscarica le schede dai portali, analizza i siti delle case e rigenera data/.
# Uso (dalla cartella del repository):   bash scripts/aggiorna_dati.sh [CARTELLA_DI_LAVORO]
# Serve Python 3 con: requests, beautifulsoup4, Pillow   (pip install requests beautifulsoup4 pillow)
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="${1:-.lavoro}"
mkdir -p "$WORK"
TODAY="$(date +%F)"

echo "1/5  Scarico le schede dei portali (con cache in $WORK/cache)…"
python3 scripts/fetch_pages.py scripts/base/houses_base.json "$WORK/cache" --refresh

echo "2/5  Estraggo i dati dalle schede…"
python3 scripts/parse_sources.py "$WORK/cache" "$WORK"

echo "3/5  Preparo l'elenco dei siti web delle case e li analizzo…"
python3 - "$WORK" <<'PY'
import json, sys
w = sys.argv[1]
H = json.load(open('scripts/base/houses_base.json', encoding='utf-8'))
o = json.load(open(f'{w}/parsed_or.json', encoding='utf-8')); c = json.load(open(f'{w}/parsed_cia.json', encoding='utf-8'))
items = []
for h in H:
    urls = [h['contatti'].get('web')] if h['contatti'].get('web') else []
    for f in h['fonti']:
        p = (o if f['s'] == 'OR' else c).get(f['id'], {})
        if p.get('web'): urls.append(p['web'])
        urls += p.get('web_descr', [])
    urls = [u for u in dict.fromkeys(u.strip() for u in urls) if u and 'facebook.com' not in u and 'ospitalitareligiosa' not in u and 'caseinautogestione' not in u]
    if urls: items.append({'id': h['id'], 'nome': h['nome'], 'comune': h['comune'], 'urls': urls})
json.dump(items, open(f'{w}/sites.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(items), 'siti')
PY
rm -f "$WORK/websites.json"
python3 scripts/check_websites.py "$WORK/sites.json" "$WORK/websites.json"

echo "4/5  Cerco la posizione delle case senza coordinate (OpenStreetMap, 1 richiesta al secondo)…"
python3 - "$WORK" <<'PY'
import json, sys
w = sys.argv[1]
H = json.load(open('scripts/base/houses_base.json', encoding='utf-8'))
c = json.load(open(f'{w}/parsed_cia.json', encoding='utf-8'))
qs = []
for h in H:
    if any(f['s'] == 'OR' for f in h['fonti']): continue
    cid = [f['id'] for f in h['fonti'] if f['s'] == 'CIA'][0]
    qs.append({'id': h['id'], 'indirizzo': c.get(cid, {}).get('indirizzo') or h.get('indirizzo'), 'comune': h['comune'], 'prov': h['prov'], 'lat': h['lat'], 'lon': h['lon']})
json.dump(qs, open(f'{w}/geo_q.json', 'w', encoding='utf-8'), ensure_ascii=False)
PY
python3 scripts/geocode.py "$WORK/geo_q.json" "$WORK/geocache.json"

echo "5/5  Genero i file del sito in data/…"
python3 scripts/build_data.py --base scripts/base/houses_base.json --meta scripts/base/meta_base.json \
  --or "$WORK/parsed_or.json" --cia "$WORK/parsed_cia.json" --web "$WORK/websites.json" \
  --geo "$WORK/geocache.json" --dns "$WORK/dns.json" --out data --today "$TODAY"
echo "Fatto. Controlla il sito in locale con:  python3 -m http.server 8000"
