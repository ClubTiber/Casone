#!/usr/bin/env python3
"""Estrae i dati dalle schede scaricate con fetch_pages.py.

Uso:  python3 scripts/parse_sources.py CACHE_DIR OUT_DIR

Scrive OUT_DIR/parsed_or.json e OUT_DIR/parsed_cia.json: un dizionario
{id_scheda: {...campi...}} per ciascun portale.
"""
import html, json, os, re, sys
from datetime import date

def clean(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "", flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return s.strip()

def paragraphs(block):
    """HTML di una descrizione -> lista di paragrafi di testo semplice."""
    block = re.sub(r"<script.*?</script>|<style.*?</style>", "", block, flags=re.S | re.I)
    block = re.sub(r"</(p|div|h\d|li|ul|ol|tr)>|<br\s*/?>", "\n", block, flags=re.I)
    block = re.sub(r"<li[^>]*>", "\n• ", block, flags=re.I)
    txt = clean(block)
    out = []
    for p in re.split(r"\n+", txt):
        p = p.strip()
        if not p:
            continue
        if out and (out[-1].endswith(("’", "'", ",")) or p[:1] in ",.;:)" or (len(p) < 25 and not p.startswith("•") and not out[-1].endswith((".", ":", "!", "?")))):
            out[-1] = (out[-1] + " " + p).replace(" ,", ",").replace(" .", ".")
        else:
            out.append(p)
    return out

PHONE_SPLIT = re.compile(r"\s*[,;/]\s*|\s+-\s+")

def phones(s):
    out = []
    for p in PHONE_SPLIT.split(s or ""):
        p = p.strip()
        if len(re.sub(r"\D", "", p)) >= 6:
            out.append(p)
    return out

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL = re.compile(r"(?:https?://|www\.)[^\s<>\"')]+", re.I)

# ---------------------------------------------------------------- ospitalitareligiosa.it

def parse_or(s, oid):
    d = {"id": oid}
    m = re.search(r'<div class="title_top info"><h2>(.*?)</h2>', s, re.S)
    d["titolo"] = clean(m.group(1)) if m else None
    m = re.search(r'class="item_display"[^>]*><span></span>(\d+)', s)
    d["visite"] = int(m.group(1)) if m else None
    m = re.search(r'row_address">\s*<span class="row_value[^>]*>(.*?)</span>', s, re.S)
    d["indirizzo"] = clean(m.group(1)) if m else None
    m = re.search(r'row_numero_posti_letto">.*?>\s*(\d+)\s*posti', s, re.S)
    d["posti"] = int(m.group(1)) if m else None
    rows = {}
    for m in re.finditer(r'<div class="row (row_[a-z0-9_]+)">\s*<span class="row_label">(.*?)</span>\s*<span class="row_value"[^>]*>(.*?)</span>', s, re.S):
        rows[m.group(1)[4:]] = clean(m.group(3))
    d["rows"] = rows
    web = None
    m = re.search(r'row_website".*?href="([^"]+)"', s, re.S)
    if m:
        web = m.group(1).strip()
    d["web"] = web
    tel = []
    for k in ("cellulare", "telefono_fisso", "telefono"):
        tel += phones(rows.get(k))
    d["tel"] = list(dict.fromkeys(tel))
    d["whatsapp"] = phones(rows.get("whatsapp_1")) + phones(rows.get("whatsapp_2"))
    d["email"] = list(dict.fromkeys(EMAIL.findall(rows.get("email", "") or "")))
    d["icone"] = re.findall(r'/images/or/servizi/([a-z_]+)\.png', s.split('row_icone_servizi', 1)[1][:3000]) if 'row_icone_servizi' in s else []
    d["modulo"] = "Contatta questa struttura" in s
    # foto (ths = miniatura piccola, thb = grande)
    foto = []
    for m in re.finditer(r'<a rel="(/components/com_djclassifieds/images/item/[^"]+_thb\.jpg)"[^>]*>\s*<img\s+alt="([^"]*)" src="([^"]+_ths\.jpg)"', s):
        foto.append({"s": "https://ospitalitareligiosa.it" + m.group(3), "b": "https://ospitalitareligiosa.it" + m.group(1), "t": html.unescape(m.group(2))})
    if not foto:
        m = re.search(r'id="djc_mainimage"[^>]*src="([^"]+)"', s)
        if m and "no-image" not in m.group(1) and "/images/item/" in m.group(1):
            b = m.group(1)
            foto.append({"s": "https://ospitalitareligiosa.it" + b.replace("_thb.", "_ths."), "b": "https://ospitalitareligiosa.it" + b, "t": ""})
    d["foto"] = [f for f in foto if "no-image" not in f["b"]]
    d["video"] = list(dict.fromkeys(re.findall(r'youtube\.com/embed/([A-Za-z0-9_-]{6,})', s)))
    m = re.search(r"L\.marker\(\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]", s)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if 35 < lat < 48 and 6 < lon < 19:
            d["lat"], d["lon"] = round(lat, 6), round(lon, 6)
    m = re.search(r'<div class="description"><h2>Descrizione</h2><div class="desc_content">(.*?)</div>\s*(?:<script|</div>)', s, re.S)
    if not m:
        m = re.search(r'<div class="desc_content">(.*?)<div class="custom_det">', s, re.S)
    desc = paragraphs(m.group(1)) if m else []
    desc = [p for p in desc if not p.startswith("Per chiedere informazioni e disponibilità usare il tasto")]
    d["descr"] = desc
    alltxt = " ".join(desc)
    d["email_descr"] = list(dict.fromkeys(e for e in EMAIL.findall(alltxt) if "ospitalitareligiosa" not in e))
    d["web_descr"] = list(dict.fromkeys(u.rstrip(".,;") for u in URL.findall(alltxt) if "ospitalitareligiosa" not in u))
    return d

# ---------------------------------------------------------------- caseinautogestione.it

IT_MONTHS = {m: i + 1 for i, m in enumerate("gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre".split())}

def num(s):
    s = (s or "").strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def parse_cia(s, cid):
    d = {"id": cid}
    if "Dettaglio Casa" not in s and "titolo shadow-title" not in s:
        d["errore"] = "pagina non valida"
        return d
    m = re.search(r'<h1 class="titolo shadow-title">(.*?)</h1>', s, re.S)
    d["titolo"] = clean(m.group(1)) if m else None
    m = re.search(r'maps\.google\.it/maps\?q=([^"]+)"', s)
    d["indirizzo"] = clean(m.group(1)) if m else None
    m = re.search(r'<strong class="">(.*?)</strong>', s)
    d["comune_txt"] = clean(m.group(1)) if m else None
    m = re.search(r'La casa è in :\s*<strong[^>]*>(.*?)</strong>', s)
    d["zona"] = clean(m.group(1)).lower() if m else None
    m = re.search(r'\(CIN\s*([A-Z0-9]*)\s*\)', s)
    d["cin"] = m.group(1) if m and m.group(1) else None
    for k, rx in (("stanze", r'home-size">(\d+)'), ("letti", r'home-beds">(\d+)'), ("bagni", r'home-baths[^"]*">(\d+)')):
        m = re.search(rx, s)
        d[k] = int(m.group(1)) if m else None
    foto = []
    for m in re.finditer(r'<img id="slide-\d+-img" class="slide" src="\.\./(image\.php/[^"?]+)\?part\(800x480\)"', s):
        p = m.group(1).replace(" ", "%20")
        base = "https://www.caseinautogestione.it/" + p
        foto.append({"s": base + "?part(480x300)", "b": base + "?resize(1280x768)", "t": ""})
    d["foto"] = list({f["b"]: f for f in foto}.values())
    m = re.search(r'unavailableDates\s*=\s*\[(.*?)\]', s, re.S)
    occ = []
    if m:
        for x in re.findall(r'"(\d{1,2})-(\d{1,2})-(\d{4})"', m.group(1)):
            try:
                occ.append(date(int(x[2]), int(x[1]), int(x[0])).isoformat())
            except ValueError:
                pass
    d["occupato"] = sorted(set(occ))
    tar = []
    for m in re.finditer(r'<div id="periodo\d+" class="tariffa[^"]*">(.*?)</section>', s, re.S):
        b = m.group(1)
        per = clean(re.search(r"<h4>(.*?)</h4>", b, re.S).group(1)) if re.search(r"<h4>(.*?)</h4>", b, re.S) else ""
        if not re.search(r"\d", per):
            continue
        def g(rx):
            mm = re.search(rx, b, re.S)
            return clean(mm.group(1)) if mm else None
        t = {"periodo": per,
             "caparra": num((g(r"Caparra per prenotazione:</strong>\s*([^<€]*)") or "")),
             "auto": num((g(r"in autogestione :</strong>\s*([^<€]*)") or "")),
             "semi": num((g(r"in semigestione </strong>\s*([^<€]*)") or "")),
             "min_posti": num((g(r"minimo per prenotare la casa:\s*([^<]*)") or ""))}
        mm = re.match(r"dal\s+(\d+)\s+(\w+)\s+al\s+(\d+)\s+(\w+)", per)
        if mm and mm.group(2) in IT_MONTHS and mm.group(4) in IT_MONTHS:
            t["da"] = [int(mm.group(1)), IT_MONTHS[mm.group(2)]]
            t["a"] = [int(mm.group(3)), IT_MONTHS[mm.group(4)]]
        if t["auto"] == 0:
            t["auto"] = None
        if t["semi"] == 0:
            t["semi"] = None
        tar.append(t)
    d["tariffe"] = tar
    m = re.search(r"<h5>Descrizione</h5>(.*?)(?:<input type=\"radio\"|<div class=\"multitab|<!-- multitab)", s, re.S)
    d["descr"] = paragraphs(m.group(1)) if m else []
    sec = {}
    for m in re.finditer(r'<h6 class="hide">(.*?)</h6>(.*?)</section>', s, re.S):
        title = clean(m.group(1))
        items = []
        for tr in re.finditer(r"<tr([^>]*)>(.*?)</tr>", m.group(2), re.S):
            attrs, body = tr.group(1), tr.group(2)
            if 'class="hide"' in attrs:
                continue
            tds = re.findall(r"<td[^>]*>(.*?)</td>", body, re.S)
            if not tds:
                continue
            label = clean(tds[0]).lstrip(">").strip()
            val = tds[1] if len(tds) > 1 else ""
            if 'alt="si"' in val:
                v = True
            elif 'alt="no"' in val:
                v = False
            else:
                v = clean(val) or None
            note = clean(re.sub(r'<img[^>]*>', '', val)) if isinstance(v, bool) else None
            items.append([label, v] + ([note] if note else []))
        sec[title] = items
    d["sezioni"] = sec
    alltxt = " ".join(d["descr"])
    d["email_descr"] = list(dict.fromkeys(EMAIL.findall(alltxt)))
    d["web_descr"] = list(dict.fromkeys(u.rstrip(".,;") for u in URL.findall(alltxt)))
    return d

def main():
    cache, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    res = {}
    for src, fn in (("or", parse_or), ("cia", parse_cia)):
        d = {}
        folder = os.path.join(cache, src)
        for f in sorted(os.listdir(folder)):
            if not f.endswith(".html"):
                continue
            pid = f[:-5]
            s = open(os.path.join(folder, f), encoding="utf-8", errors="replace").read()
            try:
                d[pid] = fn(s, pid)
            except Exception as e:  # noqa
                d[pid] = {"id": pid, "errore": repr(e)}
        res[src] = d
        json.dump(d, open(os.path.join(out, f"parsed_{src}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(src, len(d), "schede;", sum(1 for x in d.values() if x.get("errore")), "errori")

if __name__ == "__main__":
    main()
