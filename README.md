# Casone · case per gruppi in autogestione

Sito per trovare, salvare e confrontare **734 case per gruppi in autogestione** in tutta Italia
(parrocchie, scout, associazioni, campi scuola, ritiri). I dati vengono da
[ospitalitareligiosa.it](https://ospitalitareligiosa.it) e
[caseinautogestione.it](https://www.caseinautogestione.it), ricontrollati scheda per scheda
e arricchiti con l'analisi del sito web di ogni casa.

È un sito statico (HTML, CSS e JavaScript senza build): si pubblica così com'è su GitHub Pages.

## Cosa si può fare

- **Mappa e schede con foto** (oltre 4.000 foto da portali e siti), vista a tabella e solo mappa.
- **Filtri con conteggi in tempo reale**: persone e notti, date di arrivo e partenza (con il
  calendario delle prenotazioni di caseinautogestione.it), distanza dal proprio comune o dalla
  propria posizione, zona e ambiente (isolata, bosco, fiume…), quota, regione, prezzo massimo,
  posti, oltre 40 servizi (cucina industriale, sala, falò, tende, campo da calcio, accessibilità…),
  tipo di alloggi e di gestione, mesi di apertura, servizi vicini, profilo ospiti, tipo di soggiorno,
  recapiti disponibili (WhatsApp, cellulare, fisso, email, sito online), affidabilità.
- **Scheda completa** di ogni casa: galleria a schermo intero, posti, prezzo e stima di spesa per il
  gruppo, tariffe per periodo, costi extra citati, descrizioni (portali e sito della casa), servizi,
  dotazioni della cucina, calendario delle date occupate, video, mappa con indicazioni stradali,
  case vicine, verifica di operatività e cosa è cambiato rispetto ai dati precedenti.
- **Contatti pronti all'uso**: cellulare, fisso, WhatsApp, email, sito, social, moduli dei portali,
  e un **compositore della richiesta di disponibilità** che prepara il testo e lo apre in WhatsApp
  o nell'email, poi segna la casa come “contattata”.
- **Le mie liste**: Preferite più liste personali, stato del contatto (da contattare, contattata,
  in attesa, disponibile, preventivo, prenotata, scartata), voto, preventivo e appunti.
- **Esporta e importa** tutto in un file JSON: per passare a un altro dispositivo o per
  **confrontare le scelte di più persone** (importazione come liste separate con il nome di chi le
  ha fatte, confronto tra due liste: in comune / solo nell'una / solo nell'altra). Esportazione CSV
  per Excel o Fogli Google, stampa, link condivisibili di liste, schede e ricerche.
- **Confronto** affiancato fino a 6 case con il valore migliore evidenziato.
- **Ricerche salvate**, tema chiaro e scuro, funziona da telefono.
- **Pagina Dati**: panoramica visiva, elenco delle case forse non più operative con il motivo.

I dati personali (liste, note, voti) restano **solo nel browser** di chi usa il sito
(localStorage): nessun account, nessun server.

## Pubblicazione su GitHub Pages

1. Nel repository: **Settings → Pages**.
2. In *Build and deployment* scegli **Source: Deploy from a branch**, poi **Branch: `main`**,
   cartella **`/ (root)`**, e salva.
3. Dopo un minuto il sito è su `https://clubtiber.github.io/Casone/`.

Il repository è privato: GitHub Pages da un repository privato richiede un piano GitHub Team o
Enterprise per l'organizzazione. Con il piano gratuito bisogna rendere pubblico il repository
(Settings → General → Danger Zone → Change visibility).

Per provarlo sul computer: `python3 -m http.server 8000` nella cartella e apri
<http://localhost:8000> (aprendo `index.html` con doppio clic il browser blocca il caricamento dei dati).

## Struttura

```
index.html              pagina unica
assets/css/app.css      stile (tema chiaro e scuro)
assets/js/              moduli: app (navigazione), filters, explore (schede/tabella), map,
                        detail (scheda e richiesta), lists, compare, datapage, store (dati personali)
assets/icons.svg        icone (Lucide, ISC; Simple Icons, CC0)
assets/fonts/           Archivo e Source Serif 4 (OFL)
vendor/                 Leaflet, Leaflet.markercluster, topojson-client
data/houses.json        indice delle case (filtri, mappa, schede)
data/details.json       testi, foto, sezioni complete, segnali di verifica (caricato dopo)
data/meta.json          codici, etichette, statistiche
data/verifica.json      elenco delle modifiche rispetto ai dati di base
data/comuni.json        comuni italiani con coordinate (per la distanza)
data/italy.json         confini (TopoJSON)
scripts/                aggiornamento dei dati (Python)
```

## Aggiornare i dati

```bash
pip install requests beautifulsoup4 pillow
bash scripts/aggiorna_dati.sh
```

Lo script, partendo dall'elenco di base (`scripts/base/houses_base.json`):

1. riscarica le schede dei due portali (`fetch_pages.py`);
2. ne estrae foto, coordinate, video, descrizioni complete, recapiti, tariffe per periodo,
   date occupate e tutte le dotazioni (`parse_sources.py`);
3. visita il sito web di ogni casa: risponde? è parcheggiato o scaduto? estrae email, telefoni,
   WhatsApp, social, foto, testo e prezzi citati (`check_websites.py`; per i siti che non
   rispondono controlla con il DNS se il dominio esiste ancora);
4. ricava la posizione dall'indirizzo per le case senza coordinate (`geocode.py`, OpenStreetMap
   Nominatim, 1 richiesta al secondo);
5. unisce tutto, calcola prezzi, recapiti e **affidabilità** e scrive `data/` (`build_data.py`).

### Come viene stimata l'affidabilità

Per ogni casa si raccolgono segnali:

- **positivi**: calendario con prenotazioni future, sito online che cita l'anno in corso o il
  precedente, modulo di contatto attivo sul portale, scheda che cita date recenti;
- **negativi**: scheda segnalata chiusa, testi come “momentaneamente chiusa”, “chiusa per lavori”,
  dominio del sito inesistente o parcheggiato, pagina non più esistente, sito fermo da molti anni.

Ne risultano quattro livelli: *attiva*, *nessuna anomalia*, *da verificare*, *probabilmente chiusa*.
Sono indizi, non certezze: prima di escludere una casa conviene telefonare.

## Crediti e note

- Dati: ospitalitareligiosa.it, caseinautogestione.it e i siti delle singole case. Le foto si
  caricano direttamente dalle fonti, che ne restano proprietarie. Disponibilità e prezzi vanno
  sempre confermati con la struttura.
- Mappe: © OpenStreetMap, Esri. Geocodifica: OpenStreetMap Nominatim.
