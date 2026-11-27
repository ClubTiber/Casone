#!/usr/bin/env python3
"""Unisce i dati di base con le schede aggiornate e produce i file del sito.

Uso:
  python3 scripts/build_data.py \
      --base scripts/base/houses_base.json --meta scripts/base/meta_base.json \
      --or WORK/parsed_or.json --cia WORK/parsed_cia.json \
      --web WORK/websites.json --geo WORK/geocache.json --dns WORK/dns.json \
      --out data/ --today 2026-11-27

Scrive data/houses.json (indice leggero per filtri, mappa e schede),
data/details.json (testi, foto, sezioni complete; caricato dopo) e
data/meta.json (codici, date, statistiche e riepilogo della verifica).
"""
import argparse, json, math, os, re, sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from urllib.parse import urlparse
import requests

MONTHS = "gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split()

def hav(a, b, c, d):
    R, t = 6371, math.pi / 180
    x, y = (c - a) * t, (d - b) * t
    q = math.sin(x / 2) ** 2 + math.cos(a * t) * math.cos(c * t) * math.sin(y / 2) ** 2
    return 2 * R * math.asin(math.sqrt(q))

def tidy(p):
    p = re.sub(r"\s+([,.;:!?)])", r"\1", p)
    p = re.sub(r"([(’'])\s+", r"\1", p)
    p = re.sub(r"\s{2,}", " ", p)
    return p.strip()

def digits(t):
    d = re.sub(r"[^\d+]", "", t or "")
    if d.startswith("+39"): d = d[3:]
    elif d.startswith("0039"): d = d[4:]
    elif d.startswith("39") and len(d) >= 11 and d[2] == "3": d = d[2:]
    return d.lstrip("+")

def fmt_phone(n):
    """Formatta un numero italiano normalizzato (senza +39)."""
    if n.startswith("3") and len(n) == 10:
        return f"+39 {n[:3]} {n[3:]}"
    if n.startswith("0"):
        if n[:2] in ("02", "06") :
            return f"+39 {n[:2]} {n[2:]}"
        return f"+39 {n[:4]} {n[4:]}" if len(n) >= 9 else f"+39 {n}"
    return n

def phone_kind(n):
    if n.startswith("3"): return "cell"
    if n.startswith("0"): return "fisso"
    if n.startswith("8"): return "verde"
    return "altro"

FREEMAIL = ("gmail.", "libero.it", "hotmail.", "yahoo.", "alice.it", "tiscali.it", "virgilio.it", "outlook.", "live.", "icloud.", "tin.it", "email.it", "fastwebnet.it", "inwind.it", "aruba.it", "katamail", "teletu.it", "me.com")

def norm_email(e):
    return (e or "").strip().strip(".").lower()

def good_email(e, site_host, name_tokens):
    e = norm_email(e)
    if not re.fullmatch(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", e): return False
    dom = e.split("@")[1]
    if re.search(r"pec\.|legalmail|postacert|cert\.|\.pec|ospitalitareligiosa|caseinautogestione|example|sentry|wix|domain|w3\.org|schema\.org|jquery|\.(png|jpe?g|gif|webp)$", e): return False
    if site_host and (dom == site_host or site_host.endswith("." + dom) or dom.endswith("." + site_host)): return True
    if any(f in dom for f in FREEMAIL): return True
    if any(t in e for t in name_tokens if len(t) >= 5): return True
    # stesso nome di dominio di secondo livello del sito
    if site_host and dom.split(".")[-2:] == site_host.split(".")[-2:]: return True
    return False

STOP = set("casa case per ferie di del della dei delle la il lo le gli san santa santo sant villa ostello foresteria convento monastero parrocchia parrocchiale canonica centro oasi alpina rifugio colonia scout gruppi gruppo the and with una un".split())

def name_tokens(h):
    t = re.findall(r"[a-zàèéìòù]+", (h["nome"] + " " + h.get("comune", "")).lower())
    return [x for x in t if x not in STOP]

# --- prezzi citati nei testi
EXTRA = re.compile(r"caparr|cauzion|deposit|acconto|pulizi|supplement|riscaldament|tassa|soggiorno.{0,5}tassa|biancheria|lenzuol|asciugaman|kit|gas\b|luce|consumi|elettric|legna|parcheggi|animal|culla|colazione|pranzo|cena|pasto|pasti|menu|bevand|lavatric|noleggio|telo|ingresso|biglietto|visita|escursion|iva\b|penale|rimborso|bambini sotto|gratuit|bicicletta|skipass|tessera|a pasto|a lavaggio|piscina|extra|consum|spiaggia|ombrellon|lettin|utenz|per ospite", re.I)
PERP = re.compile(r"(?:a|per|x)\s*(?:persona|pers\b|pers\.|ospite|testa|notte\s+a\s+persona)|pro\s*capite|\bp\.?\s?p\.?\b|/\s*pers|a\s+notte\s+(?:a|per)\s+persona|cad(?:\.|auno)|a\s+posto\s+letto|per\s+posto\s+letto|persona/notte|persona al giorno|al giorno a persona|a persona", re.I)
PERH = re.compile(r"(?:per|la|l'|intera)\s*(?:casa|struttura|intera struttura)|casa intera|forfait|uso esclusivo|esclusiva|tutta la casa|intera casa|l'intera|per l'uso", re.I)
PERC = re.compile(r"camera|singola|doppia|tripla|quadrupla|quintupla|matrimoniale|appartamento|bungalow|piazzola|tenda\b|bicicl|pasto|pranzo|cena", re.I)
CTXN = re.compile(r"autogest|a notte|al giorno|per notte|/notte|/giorno|notte", re.I)
NUM = re.compile(r"(?:€|euro)\s?(\d{1,4}(?:[.,]\d{1,2})?)|(\d{1,4}(?:[.,]\d{1,2})?)\s?(?:€|euro|eur\b)", re.I)

def price_mentions(texts):
    out = []
    for t in texts:
        for sent in re.split(r"(?<=[.;!?])\s+|\n|•", t):
            if not re.search(r"€|euro", sent, re.I): continue
            if re.search(r"b\s?&\s?b|mezza pensione|pensione completa|colazione|ristorante", sent, re.I) and not re.search(r"autogest", sent, re.I): continue
            s = sent.strip()
            if len(s) > 260: s = s[:260] + "…"
            for m in NUM.finditer(sent):
                raw = (m.group(1) or m.group(2)).replace(".", "").replace(",", ".") if (m.group(1) or m.group(2)).count(".") and len((m.group(1) or m.group(2)).split(".")[-1]) == 3 else (m.group(1) or m.group(2)).replace(",", ".")
                try: v = float(raw)
                except ValueError: continue
                ctx = sent[max(0, m.start() - 70): m.end() + 70]
                near = sent[max(0, m.start() - 35): m.end() + 35]
                before = sent[max(0, m.start() - 45): m.start()]
                after = sent[m.end(): m.end() + 30]
                extra = bool(EXTRA.search(before)) or bool(re.match(r"\s*(?:€|euro)?\s*(?:di|per|\+|a titolo di|come)\s*(?:\w+\s*){0,2}?(?:caparr|cauzion|pulizi|riscald|supplement|tass|biancheria|consum)", after, re.I))
                near_s = sent[max(0, m.start() - 30): m.end() + 30]
                if PERC.search(near_s) and not PERP.search(near_s):
                    unit = "camera"
                elif PERP.search(ctx):
                    unit = "persona"
                elif PERH.search(ctx):
                    unit = "casa"
                elif 5 <= v <= 45 and CTXN.search(sent):
                    unit = "persona?"
                else:
                    unit = None
                out.append({"v": v, "u": unit, "extra": extra, "s": tidy(s)})
    return out

def best_text_price(mentions):
    pp = [m["v"] for m in mentions if m["u"] == "persona" and not m["extra"] and 6 <= m["v"] <= 120]
    if pp: return {"v": min(pp), "max": max(pp), "u": "persona"}
    pq = [m["v"] for m in mentions if m["u"] == "persona?" and not m["extra"]]
    pq = [v for v in pq if v >= 6]
    if pq: return {"v": min(pq), "max": max(pq), "u": "persona", "circa": True}
    ph = [m["v"] for m in mentions if m["u"] == "casa" and not m["extra"] and 60 <= m["v"] <= 6000]
    if ph: return {"v": min(ph), "max": max(ph), "u": "casa"}
    return None

YEARS = re.compile(r"(?<!\d)(20[12]\d)(?!\d)")
SHORT_YEARS = re.compile(r"\b\d{1,2}/\d{1,2}/(2[4-9])\b")
CLOSE = re.compile(r"(?:struttura|casa|ostello|foresteria|rifugio|colonia|attivit[aà])\s+(?:è\s+|e'\s+)?(?:attualmente\s+|definitivamente\s+|temporaneamente\s+)?chius[ao]|chiusura definitiva|cessat[ao]\s+l.attivit|non (?:è|e') più (?:attiv|disponibil|operativ|in gestione)|chius[ao] per (?:lavori|ristruttur)|attivit[aà] sospesa|non accett(?:a|iamo) più gruppi|non più disponibile|momentaneamente chius|temporaneamente non disponibil", re.I)

def ranges(dates):
    ds = sorted(set(dates))
    out = []
    for d in ds:
        dd = date.fromisoformat(d)
        if out and (dd - date.fromisoformat(out[-1][1])).days == 1:
            out[-1][1] = d
        else:
            out.append([d, d])
    return out

FEAT_LABELS = {
    # interni
    "cucina": "Cucina", "cucina_ind": "Cucina industriale", "lavastoviglie": "Lavastoviglie", "lavatrice": "Lavatrice",
    "sala": "Sala riunioni", "sala_grande": "Sala convegni", "proiettore": "Videoproiettore", "audio": "Impianto audio",
    "chiesa": "Cappella / chiesa", "wifi": "Wi‑Fi", "rete": "Copertura cellulare", "riscaldamento": "Riscaldamento",
    "caminetto": "Caminetto", "aria": "Aria condizionata", "biancheria": "Biancheria inclusa", "bagno_camera": "Bagni in camera",
    "ascensore": "Ascensore", "tv": "TV",
    # esterni
    "giardino": "Giardino / spazio esterno", "area_giochi": "Area giochi bimbi", "sport": "Campi sportivi", "calcio": "Calcio / calcetto",
    "pallavolo": "Pallavolo", "basket": "Basket", "tennis": "Tennis", "piscina": "Piscina", "falo": "Falò", "bbq": "Barbecue",
    "bosco": "Bosco", "spiaggia": "Spiaggia", "tende": "Spazio per tende", "recintato": "Area recintata", "bici": "Biciclette",
    # accesso
    "parcheggio": "Parcheggio", "pullman": "Parcheggio pullman", "accessibilita": "Accessibile in carrozzina", "bagni_disabili": "Bagni per disabili",
    "mezzi": "Raggiungibile coi mezzi", "carte": "Pagamento con carta",
    # altro
    "pasto": "Pasti su richiesta", "animali": "Animali ammessi", "biblioteca": "Biblioteca",
}

OR_SERV = {
    "Sala riunioni": ["sala"], "Sala convegni": ["sala", "sala_grande"], "Wi-Fi internet": ["wifi"], "Cappella": ["chiesa"], "Chiesa": ["chiesa"],
    "Accessibilità disabili": ["accessibilita"], "Giardino": ["giardino"], "Parco": ["giardino"], "Spazio esterno per attività": ["giardino"],
    "Area giochi bimbi": ["area_giochi"], "Parcheggio auto": ["parcheggio"], "Parcheggio pullman": ["pullman", "parcheggio"],
    "Campo calcetto": ["calcio", "sport"], "Campo calcio": ["calcio", "sport"], "Campo pallavolo": ["pallavolo", "sport"],
    "Campo pallacanestro": ["basket", "sport"], "Campo tennis": ["tennis", "sport"], "Palestra": ["sport"], "Piscina": ["piscina"],
    "Copertura rete cellulare": ["rete"], "Pagamento con carte di credito": ["carte"], "Pagamento con bancomat": ["carte"],
    "Biblioteca": ["biblioteca"], "Biciclette": ["bici"], "Sala TV": ["tv"],
}
OR_DOT = {"Riscaldamento": ["riscaldamento"], "Bagno in camera": ["bagno_camera"], "Asciugamani / lenzuola": ["biancheria"],
          "Televisore": ["tv"], "Aria condizionata": ["aria"], "Spazio lavanderia": ["lavatrice"]}
OR_ALLOG = {"Camerate": "camerate", "Triple/Multiple": "multiple", "Doppie": "doppie", "Singole": "singole", "Letti per sacchi a pelo": "sacchi",
            "Spazio a terra al chiuso per sacchi a pelo": "sacchi", "Spazio all'aperto per tende": "tende", "Camere per disabili": "cam_disabili", "Bungalow": "bungalow"}
OR_TRATT = {"Autogestione": "auto", "Gestione mediata": "semi", "Pensione completa": "pens", "Mezza pensione": "pens",
            "Pernottamento": "pern", "Pernottamento e prima colazione": "pern"}
CIA_FEAT = {
    ("Cucina", "Cucina industriale"): ["cucina", "cucina_ind"], ("Cucina", "Cucina standard"): ["cucina"], ("Cucina", "con lavastoviglie"): ["lavastoviglie"],
    ("Cucina", "con lavatrice"): ["lavatrice"], ("Posti/Camere/Piani", "Riscaldamento"): ["riscaldamento"], ("Posti/Camere/Piani", "Caminetto"): ["caminetto"],
    ("Posti/Camere/Piani", "Ascensore"): ["ascensore"], ("Posti/Camere/Piani", "Chiesa/cappellina"): ["chiesa"],
    ("Posti/Camere/Piani", "Lenzuola"): ["biancheria"],
    ("Spazio esterno", "Con giardino"): ["giardino"], ("Spazio esterno", "Con bosco"): ["bosco", "giardino"], ("Spazio esterno", "Con spiaggia"): ["spiaggia"],
    ("Spazio esterno", "Con possibilità campeggio"): ["tende"], ("Spazio esterno", "Con impianti sportivi"): ["sport"], ("Spazio esterno", "Con piscina"): ["piscina"],
    ("Spazio esterno", "Con possibilità falò"): ["falo"], ("Spazio esterno", "Recintato"): ["recintato"],
    ("Raggiungibile", "mezzi pubblici"): ["mezzi"], ("Raggiungibile", "pulman"): ["pullman"],
    ("Accesso disabili", "Accesso ai piani per carrozzine"): ["accessibilita"], ("Accesso disabili", "Bagni per disabili"): ["bagni_disabili"],
    ("Servizi aggiuntivi", "Internet / wi-fi"): ["wifi"], ("Servizi aggiuntivi", "Copertura rete cellulare"): ["rete"], ("Servizi aggiuntivi", "Video proiettore"): ["proiettore"],
    ("Servizi aggiuntivi", "Amplificazione audio"): ["audio"], ("Servizi aggiuntivi", "Televisore"): ["tv"],
}
BASE_SERV = {"cucina": "cucina", "sala": "sala", "giardino": "giardino", "sport": "sport", "calcio": "calcio", "pallavolo": "pallavolo", "riscaldamento": "riscaldamento",
             "parcheggio": "parcheggio", "pullman": "pullman", "accessibilita": "accessibilita", "chiesa": "chiesa", "wifi": "wifi", "piscina": "piscina", "falo": "falo",
             "bbq": "bbq", "aria": "aria", "biancheria": "biancheria", "animali": "animali", "bus": "mezzi", "pasto": "pasto", "tende": "tende"}
AMB = {"Isolato": "isolata", "Bosco": "bosco", "Fiume": "fiume", "Terme": "terme", "Centro città/paese": "centro", "Semicentrale": "semicentrale",
       "Periferia": "periferia", "Mare": "mare", "Lago": "lago", "Montagna": "montagna", "Collina": "collina", "Pianura": "pianura"}

def dns_exists(host, cache):
    if host in cache: return cache[host]
    try:
        j = requests.get("https://dns.google/resolve", params={"name": host, "type": "A"}, timeout=20).json()
        st = j.get("Status")
        cache[host] = (st == 0 and bool(j.get("Answer"))) if st in (0, 3) else None
    except Exception:
        cache[host] = None
    return cache[host]

def main():
    ap = argparse.ArgumentParser()
    for a in ("base", "meta", "or", "cia", "web", "geo", "dns", "out", "today"):
        ap.add_argument("--" + a, required=a not in ("dns",))
    A = ap.parse_args()
    TODAY = date.fromisoformat(A.today)
    H = json.load(open(A.base, encoding="utf-8"))
    META = json.load(open(A.meta, encoding="utf-8"))
    POR = json.load(open(A.__dict__["or"], encoding="utf-8"))
    PCIA = json.load(open(A.cia, encoding="utf-8"))
    WEB = {w["id"]: w for w in json.load(open(A.web, encoding="utf-8"))} if os.path.exists(A.web) else {}
    GEO = json.load(open(A.geo, encoding="utf-8")) if os.path.exists(A.geo) else {}
    DNS = json.load(open(A.dns, encoding="utf-8")) if A.dns and os.path.exists(A.dns) else {}

    index, details, report = [], {}, []
    stats = Counter()
    for h in H:
        hid = h["id"]
        fonti = h["fonti"]
        por = next((POR.get(f["id"]) for f in fonti if f["s"] == "OR"), None)
        pcias = [PCIA[f["id"]] for f in fonti if f["s"] == "CIA" and f["id"] in PCIA]
        web = WEB.get(hid)
        ch = []  # modifiche rispetto ai dati di base
        rows = (por or {}).get("rows", {})

        # --- posizione
        lat, lon, geo = h["lat"], h["lon"], "comune"
        if por and por.get("lat"):
            dkm = hav(h["lat"], h["lon"], por["lat"], por["lon"])
            if dkm < 45:
                lat, lon, geo = por["lat"], por["lon"], "esatta"
            else:
                ch.append(f"posizione sul portale a {round(dkm)} km dal comune: ignorata")
        elif GEO.get(hid, {}).get("lat"):
            lat, lon, geo = GEO[hid]["lat"], GEO[hid]["lon"], "indirizzo"
        stats["geo_" + geo] += 1

        # --- posti
        posti_or = (por or {}).get("posti")
        letti_cia = next((p.get("letti") for p in pcias if p.get("letti")), None)
        posti = posti_or or letti_cia or h.get("posti")
        alt_vals = [v for v in (letti_cia if posti_or else None, h.get("posti_alt")) if v and v != posti]
        posti_alt = alt_vals[0] if alt_vals else None
        if h.get("posti") and posti != h.get("posti"):
            ch.append(f"posti letto {h.get('posti')} → {posti}")
        min_p = h.get("min_persone")
        cia_min = [t["min_posti"] for p in pcias for t in p.get("tariffe", []) if t.get("min_posti")]
        if cia_min:
            mp = int(min(cia_min))
            if mp and mp != min_p:
                if min_p: ch.append(f"minimo persone {min_p} → {mp}")
                min_p = mp

        # --- funzionalità
        F = set(BASE_SERV[k] for k, v in (h.get("serv") or {}).items() if v and k in BASE_SERV)
        for v in (rows.get("servizi_comuni") or "").split(","):
            F.update(OR_SERV.get(v.strip(), []))
        for v in (rows.get("dotazioni_alloggi") or "").split(","):
            F.update(OR_DOT.get(v.strip(), []))
        for p in pcias:
            for title, items in p.get("sezioni", {}).items():
                for it in items:
                    if it[1] is True:
                        F.update(CIA_FEAT.get((title, it[0]), []))
        allog = set(h.get("alloggi") or [])
        for v in (rows.get("tipologia_alloggi") or "").split(","):
            if OR_ALLOG.get(v.strip()): allog.add(OR_ALLOG[v.strip()])
        if "tende" in F: allog.add("tende")
        if "tende" in allog: F.add("tende")
        tratt = set(h.get("tratt") or [])
        for v in (rows.get("trattamento") or "").split(","):
            if OR_TRATT.get(v.strip()): tratt.add(OR_TRATT[v.strip()])
        amb = set()
        for v in (rows.get("zona") or h.get("zona_txt") or "").split(","):
            if AMB.get(v.strip()): amb.add(AMB[v.strip()])
        if "bosco" in amb: F.add("bosco")
        mesi = h.get("mesi")
        if rows.get("quando_andare"):
            m2 = sorted({MONTHS.index(x.strip().lower()) + 1 for x in rows["quando_andare"].split(",") if x.strip().lower() in MONTHS})
            if m2:
                if mesi and m2 != mesi: ch.append("mesi di apertura aggiornati")
                mesi = m2
        tipi = [x.strip() for x in rows["tipo_di_struttura"].split(",")] if rows.get("tipo_di_struttura") else h.get("tipi")
        gest = rows.get("gestione_struttura") or h.get("gestione_ente")
        cin = rows.get("codice_identificativo_nazionale_") or next((p.get("cin") for p in pcias if p.get("cin")), None) or h.get("cin")
        if cin and not re.match(r"^IT\d", cin or "") and cin.lower() not in ("esente",): cin = cin
        camere = next((p.get("stanze") for p in pcias if p.get("stanze")), None)
        bagni = next((p.get("bagni") for p in pcias if p.get("bagni")), None)
        dist = dict(h.get("dist") or {})
        for p in pcias:
            for it in p.get("sezioni", {}).get("Nelle vicinanze", []):
                try:
                    if it[0].startswith("Ospedale") and it[1] and "ospedale" not in dist: dist["ospedale"] = float(str(it[1]).replace(",", "."))
                    if it[0].startswith("Stazione") and it[1] and "treno" not in dist: dist["treno"] = float(str(it[1]).replace(",", "."))
                except ValueError:
                    pass

        # --- calendario e tariffe (caseinautogestione.it)
        occ = sorted({d for p in pcias for d in p.get("occupato", []) if d >= TODAY.isoformat()})
        occ_all = [d for p in pcias for d in p.get("occupato", [])]
        tar = []
        for p in pcias:
            for t in p.get("tariffe", []):
                tar.append({k: t[k] for k in ("da", "a", "auto", "semi", "min_posti", "caparra", "periodo") if t.get(k) is not None})

        # --- recapiti
        # un sito che rimanda a un dominio diverso (es. dominio scaduto e riusato) non è più quello della casa:
        # non se ne usa nulla (foto, testi, recapiti) e non lo si linka
        def sld(u):
            u = u or ""
            if not re.match(r"https?://", u): u = "http://" + u
            p = urlparse(u).netloc.lower().split(":")[0].removeprefix("www.").split(".")
            return p[-2] if len(p) >= 2 else p[0]
        redirected = bool(web and web.get("ok") and sld(web["urls"][0]) != sld(web.get("url")))
        site_ok = bool(web and web.get("ok")) and not redirected and not web.get("parcheggiato")
        # sito generico (ente, associazione) che non nomina né la casa né il comune: si tiene il link ma non i contenuti
        generic = False
        if site_ok:
            import unicodedata
            nn = lambda s: unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()
            blob = nn(" ".join([web.get("titolo") or "", web.get("meta") or "", " ".join(web.get("testo") or []), web.get("url") or ""]))
            toks = [t for t in re.findall(r"[a-z]+", nn(h["nome"])) if t not in STOP and len(t) >= 3]
            generic = not (any(t in blob for t in toks) or nn(h["comune"]) in blob)
            if generic:
                site_ok = False
        site_host = urlparse(web["url"]).netloc.lower().removeprefix("www.") if site_ok else (urlparse(h["contatti"].get("web") or "").netloc.lower().removeprefix("www.") if h["contatti"].get("web") else "")
        toks = name_tokens(h)
        phones = {}
        def addp(raw, src):
            n = digits(raw)
            if not (8 <= len(n) <= 11) or n[0] not in "038": return
            if n not in phones: phones[n] = {"n": fmt_phone(n), "k": phone_kind(n), "src": [src]}
            elif src not in phones[n]["src"]: phones[n]["src"].append(src)
        # i recapiti di base con "fonte" sono stati trovati con ricerche sul web, non nella scheda del portale
        base_src = "web" if h["contatti"].get("fonte") else "scheda"
        for t in h["contatti"].get("tel", []) or []: addp(t, base_src)
        for t in (por or {}).get("tel", []): addp(t, "scheda")
        if site_ok:
            for t in web.get("tel", []): addp(t, "sito")
        wa = {}
        for t in (por or {}).get("whatsapp", []):
            n = digits(t)
            if len(n) >= 9: wa[n] = fmt_phone(n)
        if site_ok:
            for t in web.get("whatsapp", []):
                n = digits(t)
                if len(n) >= 9: wa[n] = fmt_phone(n)
        emails = []
        for e in (h["contatti"].get("email") or []) + (por or {}).get("email", []):
            e = norm_email(e)
            if e and e not in emails: emails.append(e)
        if site_ok:
            for e in web.get("email", []):
                if good_email(e, site_host, toks) and norm_email(e) not in emails: emails.append(norm_email(e))
        for p in [por] + pcias:
            for e in (p or {}).get("email_descr", []):
                if norm_email(e) not in emails and "ospitalitareligiosa" not in e: emails.append(norm_email(e))
        webu = (web.get("url") if site_ok else None) or h["contatti"].get("web") or (por or {}).get("web")
        if redirected: webu = web["urls"][0]
        if generic: webu = web.get("url") or webu
        social = web.get("social", []) if site_ok else []
        form_or = bool(por and por.get("modulo"))
        cia_ids = [f["id"] for f in fonti if f["s"] == "CIA"]
        old_tel = {digits(t) for t in h["contatti"].get("tel", []) or []}
        new_tel = [p for n, p in phones.items() if n not in old_tel]
        if new_tel: ch.append("nuovi telefoni: " + ", ".join(p["n"] for p in new_tel))
        new_em = [e for e in emails if e not in [norm_email(x) for x in h["contatti"].get("email") or []]]
        if new_em: ch.append("nuove email: " + ", ".join(new_em))
        if wa: ch.append("WhatsApp: " + ", ".join(wa.values()))

        # --- sito web: stato
        web_state = None
        if web:
            if redirected:
                web_state = "reindirizzato"
            elif web.get("ok"):
                web_state = "parcheggiato" if web.get("parcheggiato") else "online"
                if generic: stats["web_generico"] += 1
            else:
                host = urlparse(web["urls"][0] if re.match(r"https?://", web["urls"][0]) else "http://" + web["urls"][0]).netloc.lower()
                ex = dns_exists(host, DNS)
                if ex is False and host.startswith("www."):
                    ex = dns_exists(host[4:], DNS)
                errs = [str(t[1]) for t in web.get("tentativi", [])]
                if ex is False: web_state = "dominio_inesistente"
                elif any(e in ("404", "410") for e in errs): web_state = "pagina_inesistente"
                else: web_state = "non_verificabile"
            stats["web_" + web_state] += 1

        # --- testi
        descr_or = [tidy(p) for p in (por or {}).get("descr", [])]
        descr_cia = [tidy(p) for p in pcias[0].get("descr", [])] if pcias else []
        site_txt = [tidy(p) for p in (web.get("testo", []) if site_ok else [])]
        alltext = descr_or + descr_cia + ([h["descr"]] if h.get("descr") else []) + ([h["prezzi"]] if h.get("prezzi") else [])

        # --- prezzi
        pm = price_mentions(descr_or + descr_cia + ([h["prezzi"]] if h.get("prezzi") else []) + ([h["prezzo_txt"]] if h.get("prezzo_txt") else []))
        site_pm = price_mentions(web.get("prezzi", []) if site_ok else [])
        cia_auto = [t["auto"] for t in tar if t.get("auto")]
        cia_semi = [t["semi"] for t in tar if t.get("semi")]
        prezzo = None
        if cia_auto:
            prezzo = {"v": min(cia_auto), "max": max(cia_auto), "u": "persona", "t": "auto", "f": "tariffe caseinautogestione.it"}
        elif h.get("prezzo_auto") is not None:
            prezzo = {"v": h["prezzo_auto"], "u": "persona", "t": "auto", "f": "scheda"}
        elif h.get("prezzo_da") is not None:
            prezzo = {"v": h["prezzo_da"], "u": "persona", "t": "da", "f": "scheda"}
        else:
            bt = best_text_price(pm) or best_text_price(site_pm)
            if bt:
                prezzo = {**bt, "t": "testo", "f": "descrizione" if best_text_price(pm) else "sito web"}
            elif cia_semi:
                prezzo = {"v": min(cia_semi), "max": max(cia_semi), "u": "persona", "t": "semi", "f": "tariffe caseinautogestione.it"}
            elif h.get("prezzo_semi") is not None:
                prezzo = {"v": h["prezzo_semi"], "u": "persona", "t": "semi", "f": "scheda"}
        if prezzo and prezzo.get("max") == prezzo.get("v"): prezzo.pop("max", None)
        old_p = h.get("prezzo_auto") if h.get("prezzo_auto") is not None else h.get("prezzo_da")
        if prezzo and old_p is None and prezzo["t"] in ("auto", "testo", "semi"): ch.append(f"prezzo trovato: € {prezzo['v']:g} ({prezzo['f']})")
        elif prezzo and old_p is not None and abs(prezzo["v"] - old_p) > 0.01 and prezzo["t"] == "auto": ch.append(f"prezzo autogestione € {old_p:g} → € {prezzo['v']:g}")
        semi = min(cia_semi) if cia_semi else h.get("prezzo_semi")
        stats["prezzo_" + (prezzo["t"] if prezzo else ("libera" if h.get("offerta_libera") else "nd"))] += 1
        extra_costs = list(dict.fromkeys(m["s"] for m in pm + site_pm if m["extra"]))[:6]
        price_snips = list(dict.fromkeys(m["s"] for m in pm + site_pm if not m["extra"]))[:6]

        # --- operatività
        sig = []  # (polarità, codice, testo)
        if h.get("chiusa"):
            sig.append((-3, "chiusa", h.get("avvisi") or "Segnalata come chiusa"))
        def ctx(t, m):
            a = max(t.rfind(".", 0, m.start()), t.rfind("\n", 0, m.start()), t.rfind("·", 0, m.start())) + 1
            ends = [i for i in (t.find(".", m.end()), t.find("\n", m.end()), t.find("·", m.end())) if i >= 0]
            b = min(ends) if ends else len(t)
            s2 = t[a:b].strip()
            return (s2[:180] + "…") if len(s2) > 180 else s2
        cl_txt = [ctx(t, m) for t in alltext + site_txt for m in CLOSE.finditer(t)]
        if web and web.get("chiusura"): cl_txt += web["chiusura"]
        if cl_txt:
            sig.append((-2, "testo_chiusura", "Il testo dice: “" + cl_txt[0] + "”"))
        if web_state == "dominio_inesistente":
            sig.append((-2, "dominio", "Il dominio del sito web non esiste più"))
        elif web_state == "reindirizzato":
            sig.append((-2, "reindirizzato", f"Il sito indicato ({sld(web['urls'][0])}) ora rimanda a un altro sito che non c'entra con la casa ({urlparse(web['url']).netloc})"))
        elif web_state == "parcheggiato":
            sig.append((-2, "parcheggiato", "Il sito web è un dominio parcheggiato o sospeso (" + (web.get("parcheggiato") or "") + ")"))
        elif web_state == "pagina_inesistente":
            sig.append((-1, "pagina_ko", "La pagina del sito indicata non esiste più (errore 404)"))
        fut = [d for d in occ if d <= (TODAY + timedelta(days=500)).isoformat()]
        if fut:
            sig.append((2, "calendario", f"Calendario con {len(fut)} giorni già prenotati nei prossimi mesi"))
        if (site_ok or generic) and web_state == "online":
            yrs = [y for y in web.get("anni", []) if y <= TODAY.year + 1]
            if yrs and max(yrs) >= TODAY.year - 1:
                sig.append((2, "sito_recente", f"Sito online che cita il {max(yrs)}"))
            elif yrs and max(yrs) <= TODAY.year - 7:
                sig.append((-1, "sito_vecchio", f"Sito online ma fermo al {max(yrs)}"))
            else:
                sig.append((1, "sito_online", "Sito web online"))
        ty = [int(y) for t in alltext for y in YEARS.findall(t)] + [2000 + int(y) for t in alltext for y in SHORT_YEARS.findall(t)]
        ty = [y for y in ty if 2010 <= y <= TODAY.year + 2]
        if ty and max(ty) >= TODAY.year - 1:
            sig.append((1, "scheda_recente", f"La scheda cita il {max(ty)}"))
        elif ty and max(ty) <= TODAY.year - 6:
            stale_cia = not por and not tar and not occ
            sig.append((-1 if stale_cia else 0, "scheda_vecchia", f"La scheda cita solo anni fino al {max(ty)}"))
        has_direct = bool(phones or emails or wa or (site_ok and web_state == "online"))
        if form_or:
            sig.append((1, "aderente", "Aderisce a ospitalitareligiosa.it (modulo di contatto attivo)"))
        if not has_direct and not form_or and not cia_ids:
            sig.append((0, "nessun_contatto", "Nessun recapito pubblicato: vanno cercati"))
        pos = sum(s[0] for s in sig if s[0] > 0)
        neg = [s for s in sig if s[0] < 0]
        if any(s[0] <= -3 for s in neg) or (any(s[1] in ("testo_chiusura",) for s in neg) and pos < 2):
            stato = "chiusa"
        elif any(s[1] in ("dominio", "parcheggiato", "reindirizzato") for s in neg) and not phones and not emails and not wa and pos < 2:
            stato = "chiusa"
        elif neg and pos < 2:
            stato = "dubbia"
        elif pos >= 2 or any(s[1] in ("calendario", "sito_recente") for s in sig):
            stato = "attiva"
        else:
            stato = "ok"
        stats["stato_" + stato] += 1

        # --- foto
        foto, seenf = [], set()
        for p in [por] + pcias:
            for f in (p or {}).get("foto", []):
                if f["b"] not in seenf:
                    seenf.add(f["b"]); foto.append({"s": f["s"], "b": f["b"], "o": "OR" if p is por else "CIA"})
        # niente segnaposto e niente file che non sono immagini (PDF, HEIC, download interrotti)
        foto = [f for f in foto if "no-image" not in f["b"] and not re.search(r"\.(pdf|heic|heif|crdownload|docx?|zip)(\?|$)", f["b"], re.I)]
        if not foto:
            for u in [u for u in (h.get("foto", []) or []) if "no-image" not in u]:
                if u not in seenf:
                    seenf.add(u); foto.append({"s": u, "b": u, "o": "OR" if "ospitalita" in u else "CIA"})
        if site_ok and web_state == "online":
            for f in web.get("foto", []):
                if re.search(r"webcam|/cam/|camplus|meteo", f["u"], re.I): continue
                if f["u"] not in seenf:
                    seenf.add(f["u"]); foto.append({"s": f["u"], "b": f["u"], "o": "sito"})
        old_n = len([u for u in (h.get("foto") or []) if "no-image" not in u])
        if len(foto) > old_n:
            ch.append(f"foto {old_n} → {len(foto)}")
        video = (por or {}).get("video", [])

        rec = {
            "id": hid, "nome": h["nome"], "tipo": h.get("tipo") or (tipi[0] if tipi else None), "tipi": tipi or [],
            "comune": h["comune"], "prov": h["prov"], "regione": h["regione"], "ind": (por or {}).get("indirizzo") or h.get("indirizzo") or (pcias[0].get("indirizzo") if pcias else None),
            "lat": lat, "lon": lon, "geo": geo,
            "posti": posti, "posti_alt": posti_alt, "min_p": min_p, "min_n": h.get("min_notti"), "camere": camere, "bagni": bagni,
            "zona": h.get("zona") or "ignota", "amb": sorted(amb), "alt": h.get("alt"),
            "mesi": mesi, "tratt": sorted(tratt), "allog": sorted(allog), "f": sorted(F),
            "prof": h.get("profilo") or [], "mot": h.get("motivo") or [], "gest": gest,
            "prezzo": prezzo, "semi": semi, "libera": bool(h.get("offerta_libera")),
            "dist": dist or None,
            "foto": [(f["b"] if f["o"] == "OR" else f["s"]) for f in foto[:6]], "nf": len(foto), "vid": len(video),
            "c": {k: v for k, v in {
                "tel": [p for p in phones.values()], "wa": list(wa.values()), "email": emails, "web": webu, "webs": web_state,
                "form": form_or, "social": social[:4], "fonte": h["contatti"].get("fonte")}.items() if v},
            "src": sorted({f["s"] for f in fonti}),
            "occ": ranges(occ), "tar": tar or None,
            "stato": stato, "nuovo": bool(h.get("nuovo")), "cin": cin, "visite": (por or {}).get("visite"),
        }
        rec = {k: v for k, v in rec.items() if v not in (None, [], {}, "") and v is not False}
        index.append(rec)

        det = {
            "fonti": [{"s": f["s"], "url": f["url"]} for f in fonti],
            "cia_contatto": [f"https://www.caseinautogestione.it/it/m-contatta-gestore.php?hid={i}" for i in cia_ids],
            "foto": foto, "video": video,
            "sintesi": h.get("descr"), "descr_or": descr_or, "descr_cia": descr_cia,
            "sito": ({"url": web.get("url"), "titolo": web.get("titolo"), "meta": web.get("meta"), "testo": site_txt, "anni": web.get("anni"), "pagine": web.get("pagine")} if site_ok else
                     {"url": web.get("url"), "titolo": web.get("titolo"), "generico": True} if generic else ({"stato": web_state, "url": (web.get("urls") or [None])[0], "verso": (urlparse(web["url"]).netloc if redirected else None), "tentativi": web.get("tentativi")} if web else None)),
            "segnali": [{"p": s[0], "c": s[1], "t": s[2]} for s in sig],
            "prezzi_txt": price_snips, "costi_extra": extra_costs, "prezzi_scheda": h.get("prezzi") or h.get("prezzo_txt"),
            "minimo": h.get("minimo"), "avvisi": h.get("avvisi"), "periodi": h.get("periodi"), "periodi_cia": h.get("periodi_cia"),
            "gestione_txt": rows.get("trattamento") or h.get("gestione") or h.get("gestione_cia"),
            "zona_txt": rows.get("zona") or h.get("zona_txt"), "servizi_txt": rows.get("servizi_comuni") or h.get("servizi_txt"),
            "dotazioni": rows.get("dotazioni_alloggi"), "alloggi_txt": rows.get("tipologia_alloggi") or h.get("camere"),
            "profilo_txt": rows.get("profilo_dell_ospite"), "motivo_txt": rows.get("motivo_soggiorno"),
            "camere_txt": h.get("camere"), "bagni_txt": h.get("bagni"), "cucina": h.get("cucina"), "sale": h.get("sale"), "esterni": h.get("esterni"),
            "sport": h.get("sport"), "biancheria": h.get("biancheria"), "pasti": h.get("pasti_txt"), "regole": h.get("regole"),
            "vicino": h.get("vicino"), "ente": h.get("ente"), "alias": h.get("alias"), "collegate": h.get("collegate"), "altri": h.get("altri"),
            "cia": [{"sezioni": p.get("sezioni"), "tariffe": p.get("tariffe"), "letti": p.get("letti"), "stanze": p.get("stanze"), "bagni": p.get("bagni"), "occupato_tot": len(p.get("occupato", []))} for p in pcias] or None,
            "cambi": ch,
        }
        details[hid] = {k: v for k, v in det.items() if v not in (None, [], {}, "")}
        if ch: report.append({"id": hid, "nome": h["nome"], "cambi": ch})

    meta = dict(META)
    meta["date_base"] = META.get("date")
    meta["date"] = TODAY.isoformat()
    meta["feat"] = FEAT_LABELS
    meta["stats"] = dict(stats)
    meta["n"] = len(index)
    meta["verifica"] = {"case_con_cambi": len(report)}
    os.makedirs(A.out, exist_ok=True)
    json.dump(index, open(os.path.join(A.out, "houses.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(details, open(os.path.join(A.out, "details.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(meta, open(os.path.join(A.out, "meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(report, open(os.path.join(A.out, "verifica.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if A.dns:
        json.dump(DNS, open(A.dns, "w", encoding="utf-8"), indent=0)
    for k, v in sorted(stats.items()): print(f"{k:28s} {v}")
    print("case con cambi:", len(report))

if __name__ == "__main__":
    main()
