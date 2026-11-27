#!/usr/bin/env python3
"""Controlla e analizza il sito web di ogni casa.

Uso:  python3 scripts/check_websites.py SITI.json OUT.json [CACHE_DIR]

SITI.json è una lista di {"id": id_casa, "nome": ..., "comune": ..., "urls": [..]}.
Per ogni casa prova gli indirizzi (prima in https), segue i redirect e registra:
- se il sito risponde (stato, url finale, https sì/no, errore);
- titolo, meta description e un estratto del testo;
- email, telefoni, link WhatsApp e social trovati nella home e in alcune
  pagine interne (contatti, la casa, tariffe, galleria...);
- foto grandi (og:image e immagini >= 480 px), verificate scaricandole.
Richiede: requests, beautifulsoup4, Pillow.
"""
import io, json, os, re, sys, time, hashlib
import concurrent.futures as cf
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from PIL import Image

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.5"})

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(?:it|com|org|net|eu|info|biz|va|sm|ch|de|fr)\b", re.I)
PHONE = re.compile(r"(?<![\d/.])(?:\+39[\s.]?)?(?:0\d{1,3}|3\d{2})[\s./-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{1,4})?(?![\d/])")
SOCIAL = ("facebook.com", "instagram.com", "youtube.com", "tiktok.com", "twitter.com", "x.com")
SUBPAGE = re.compile(r"contatt|dove|come.?arriv|la.?casa|struttur|tariff|prezz|listin|galler|foto|chi.?siamo|ospitalit|gruppi|camere|servizi|info", re.I)
BAD_IMG = re.compile(r"logo|icon|favicon|sprite|banner-?ad|placeholder|loading|pixel|blank|flag|bandier|whatsapp|facebook|instagram|youtube|tripadvisor|booking|cookie|map|captcha|avatar|emoji|badge|payment|paypal|visa", re.I)

def fetch(url, timeout=25):
    r = S.get(url, timeout=timeout, allow_redirects=True)
    return r

def norm_phone(p):
    d = re.sub(r"[^\d+]", "", p)
    if d.startswith("+39"):
        d = d[3:]
    if d.startswith("0039"):
        d = d[4:]
    return d

def page_info(html, base):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg"]):
        t.decompose()
    title = (soup.title.get_text(" ", strip=True) if soup.title else "")[:200]
    md = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    desc = (md.get("content") or "").strip()[:500] if md else ""
    og = [m.get("content") for m in soup.find_all("meta", attrs={"property": re.compile("og:image", re.I)}) if m.get("content")]
    links, imgs_a = [], []
    emails, tels, wa, social = set(), set(), set(), set()
    for a in soup.find_all("a", href=True):
        h = a["href"].strip()
        if h.lower().startswith("mailto:"):
            e = h[7:].split("?")[0].strip()
            if EMAIL.fullmatch(e):
                emails.add(e.lower())
        elif h.lower().startswith("tel:"):
            tels.add(re.sub(r"\s+", " ", h[4:].strip()))
        elif "wa.me/" in h or "api.whatsapp.com" in h:
            m = re.search(r"(?:wa\.me/|phone=)(\+?\d+)", h)
            if m:
                wa.add(m.group(1))
        else:
            u = urljoin(base, h)
            host = urlparse(u).netloc.lower()
            if any(s in host for s in SOCIAL):
                if re.search(r"facebook\.com/(sharer|share|dialog|plugins)|/intent/|/share", u):
                    continue
                social.add(u.split("?")[0].rstrip("/"))
            elif re.search(r"\.(jpe?g|webp)(\?|$)", u, re.I) and not BAD_IMG.search(u):
                imgs_a.append(u)
            else:
                links.append((u, a.get_text(" ", strip=True)[:60]))
    text = soup.get_text("\n", strip=True)
    for e in EMAIL.findall(text):
        emails.add(e.lower())
    for p in PHONE.findall(text):
        p = p.strip()
        # senza separatori e senza +39 potrebbe essere una partita IVA o un codice
        if len(re.sub(r"\D", "", p)) >= 8 and (re.search(r"[\s./-]", p) or p.startswith("+39")):
            tels.add(p)
    imgs = [urljoin(base, u) for u in og] + imgs_a
    for im in soup.find_all("img"):
        cands = []
        for attr in ("data-src", "data-lazy-src", "data-original", "src"):
            if im.get(attr) and not im.get(attr).startswith("data:"):
                cands.append(im.get(attr))
                break
        ss = im.get("srcset") or im.get("data-srcset")
        if ss:
            best = None
            for part in ss.split(","):
                bits = part.strip().split()
                if bits:
                    w = int(re.sub(r"\D", "", bits[1]) or 0) if len(bits) > 1 and bits[1].endswith("w") else 0
                    if best is None or w > best[0]:
                        best = (w, bits[0])
            if best:
                cands = [best[1]]
        for c in cands:
            u = urljoin(base, c)
            alt = (im.get("alt") or "") + " " + (" ".join(im.get("class") or []))
            if BAD_IMG.search(u) or BAD_IMG.search(alt):
                continue
            if not re.search(r"\.(jpe?g|png|webp)(\?|$)", u, re.I):
                continue
            imgs.append(u)
    # testo leggibile: paragrafi lunghi
    paras = []
    for p in soup.find_all(["p", "li"]):
        t = p.get_text(" ", strip=True)
        if 80 <= len(t) <= 1200 and not re.search(r"cookie|privacy|copyright|p\.?\s?iva|all rights|tutti i diritti", t, re.I):
            paras.append(t)
    return {"title": title, "desc": desc, "links": links, "emails": emails, "tels": tels, "wa": wa,
            "social": social, "imgs": imgs, "paras": paras, "text": text}

def check_img(u, seen):
    try:
        r = S.get(u, timeout=20, stream=True)
        if r.status_code != 200 or "image" not in r.headers.get("content-type", ""):
            return None
        data = r.raw.read(6_000_000, decode_content=True)
        h = hashlib.md5(data).hexdigest()
        if h in seen:
            return None
        seen.add(h)
        im = Image.open(io.BytesIO(data))
        w, hgt = im.size
        if w < 480 or hgt < 300 or not (0.45 <= w / hgt <= 2.6):
            return None
        return {"u": r.url, "w": w, "h": hgt, "kb": len(data) // 1024}
    except Exception:
        return None

def candidates(urls):
    out = []
    for u in urls:
        u = u.strip()
        if not u:
            continue
        if not re.match(r"https?://", u, re.I):
            u = "http://" + u
        p = urlparse(u)
        https = urlunparse(("https",) + tuple(p[1:]))
        for c in (https, u):
            if c not in out:
                out.append(c)
    return out

def analyse(item):
    res = {"id": item["id"], "urls": item["urls"], "ok": False, "tentativi": []}
    r = None
    for u in candidates(item["urls"]):
        try:
            r = fetch(u)
            res["tentativi"].append([u, r.status_code])
            if r.status_code < 400 and len(r.content) > 300:
                break
        except Exception as e:
            res["tentativi"].append([u, type(e).__name__])
            r = None
    if r is None or r.status_code >= 400:
        res["errore"] = (res["tentativi"][-1][1] if res["tentativi"] else "nessun url")
        return res
    r.encoding = r.apparent_encoding if (r.encoding or "").lower() in ("iso-8859-1", "") else r.encoding
    res["ok"] = True
    res["url"] = r.url
    res["https"] = r.url.startswith("https://")
    base_host = urlparse(r.url).netloc.lower().removeprefix("www.")
    info = page_info(r.text, r.url)
    res["titolo"] = info["title"]
    res["meta"] = info["desc"]
    emails, tels, wa, social, imgs, paras = set(info["emails"]), set(info["tels"]), set(info["wa"]), set(info["social"]), list(info["imgs"]), list(info["paras"])
    sub = []
    for u, txt in info["links"]:
        pu = urlparse(u)
        if pu.netloc.lower().removeprefix("www.") != base_host:
            continue
        if re.search(r"\.(pdf|jpe?g|png|zip|docx?)$", pu.path, re.I):
            continue
        if SUBPAGE.search(pu.path + " " + txt) and u.split("#")[0] not in sub and u.split("#")[0] != r.url:
            sub.append(u.split("#")[0])
    res["pagine"] = [r.url]
    alltext = [info["text"]]
    for u in sub[:5]:
        try:
            rr = fetch(u, timeout=20)
            if rr.status_code >= 400:
                continue
            rr.encoding = rr.apparent_encoding if (rr.encoding or "").lower() in ("iso-8859-1", "") else rr.encoding
            i2 = page_info(rr.text, rr.url)
            emails |= i2["emails"]; tels |= i2["tels"]; wa |= i2["wa"]; social |= i2["social"]
            imgs += i2["imgs"]; paras += i2["paras"]; alltext.append(i2["text"])
            res["pagine"].append(rr.url)
            time.sleep(0.3)
        except Exception:
            pass
    big = "\n".join(alltext)
    res["kb"] = len(r.content) // 1024
    yrs = [int(y) for y in re.findall(r"(?<!\d)(20[0-3]\d)(?!\d)", big)]
    res["anni"] = sorted(set(y for y in yrs if 2000 <= y <= 2030))[-6:]
    low = (info["title"] + " " + big[:4000]).lower()
    PARK = r"domain (is )?for sale|dominio (è )?in vendita|this domain|parked|parcheggiat|buy this domain|account suspended|sito sospeso|website expired|hosting scaduto|under construction|sito in costruzione|coming soon|index of /|default web site page|welcome to nginx|it works!|domain has expired|dominio scaduto|godaddy|sedo"
    m = re.search(PARK, low)
    res["parcheggiato"] = m.group(0) if m else None
    CLOSE = r"(?:struttura|casa|ostello|foresteria|rifugio)\s+(?:è\s+)?(?:definitivamente\s+|temporaneamente\s+)?chius[ao]|chiusura definitiva|cessat[ao] l.attivit|non (?:è più|e' piu) (?:attiv|disponibil|operativ)|chiuso per (?:lavori|ristruttur)|in ristrutturazione|attività sospesa|non accettiamo più|non più disponibile"
    cl = [mm.group(0) for mm in re.finditer(CLOSE, big.lower())]
    res["chiusura"] = list(dict.fromkeys(cl))[:3]
    PRICE = re.compile(r"[^.\n]{0,90}(?:€|euro)\s?\d[\d.,]*[^.\n]{0,90}|[^.\n]{0,90}\d[\d.,]*\s?(?:€|euro)[^.\n]{0,90}", re.I)
    res["prezzi"] = list(dict.fromkeys(p.strip() for p in PRICE.findall(big)))[:8]
    res["email"] = sorted(e for e in emails if not re.search(r"example|sentry|wixpress|domain\.|@2x|\.(png|jpg)$", e))[:6]
    seen_t, tl = set(), []
    for t in tels:
        n = norm_phone(t)
        if 8 <= len(n) <= 11 and n not in seen_t and (n.startswith("0") or n.startswith("3")):
            seen_t.add(n); tl.append(t)
    res["tel"] = tl[:6]
    res["whatsapp"] = sorted(wa)[:3]
    res["social"] = sorted(social)[:6]
    # foto
    seen, out, tried = set(), [], 0
    for u in list(dict.fromkeys(imgs)):
        if tried >= 40 or len(out) >= 12:
            break
        tried += 1
        ci = check_img(u, seen)
        if ci:
            out.append(ci)
    res["foto"] = out
    # testo
    seen_p, txt = set(), []
    for p in paras:
        k = p[:60]
        if k in seen_p:
            continue
        seen_p.add(k)
        txt.append(p)
        if sum(len(x) for x in txt) > 2500:
            break
    res["testo"] = txt
    return res

def main():
    src, out = sys.argv[1], sys.argv[2]
    items = json.load(open(src, encoding="utf-8"))
    done = {}
    if os.path.exists(out):
        done = {x["id"]: x for x in json.load(open(out, encoding="utf-8"))}
    todo = [x for x in items if x["id"] not in done]
    print(len(todo), "siti da analizzare", flush=True)
    with cf.ThreadPoolExecutor(8) as ex:
        for i, r in enumerate(ex.map(analyse, todo)):
            done[r["id"]] = r
            print(i, r["id"], "OK" if r["ok"] else "KO", r.get("url") or r.get("errore"), len(r.get("foto", [])), "foto", flush=True)
            if i % 10 == 0:
                json.dump(list(done.values()), open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(list(done.values()), open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)

if __name__ == "__main__":
    main()
