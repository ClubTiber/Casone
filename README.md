# Casone · case per gruppi in autogestione

Sito per trovare, salvare e confrontare **734 case per gruppi in autogestione** in tutta Italia
(parrocchie, scout, associazioni, campi scuola, ritiri). I dati vengono da
[ospitalitareligiosa.it](https://ospitalitareligiosa.it) e
[caseinautogestione.it](https://www.caseinautogestione.it), ricontrollati scheda per scheda
e arricchiti con l'analisi del sito web di ogni casa.

È un sito statico (HTML, CSS e JavaScript senza build): si pubblica così com'è su GitHub Pages.

## Come è organizzato

Il sito è costruito attorno al lavoro di chi organizza un'uscita: **trovare** le case adatte,
**contattarle**, **scegliere** insieme agli altri. Si mostra subito solo quello che serve a tutti;
il resto è a un clic.

**Cerca** (pagina iniziale) si apre con una frase da completare, con le quattro domande che contano
per ogni gruppo e per le quali i dati ci sono quasi sempre:

> Siamo in **35**, partiamo da **Roma, entro 150 km**, **a luglio**, e cerchiamo una casa **in montagna**.

- *Quanti siete* (e per quante notti): posti letto sufficienti, minimo di persone e di notti.
- *Da dove partite*: distanza in linea d'aria, ordinamento dalla più vicina, cerchio sulla mappa.
- *In che periodo*: mesi di apertura, oppure date precise (con il calendario delle prenotazioni,
  che però esiste solo per una ventina di case).
- *In che zona*: mare, montagna, collina, lago…, e com'è intorno (isolata, nel bosco…).

Sotto la frase, poche **scorciatoie** per quello che conta di più per un gruppo: telefono o email
(solo una casa su cinque li ha: le altre si contattano dal modulo del portale), prezzo indicato,
spazio per tende, campo da calcio, sala grande, cucina industriale, falò, isolata, accessibile.
Tutto il resto (oltre 40 servizi, alloggi, prezzo massimo, regioni, quota, servizi vicini, profilo
ospiti, tipo di struttura, affidabilità, ricerche salvate) è in **Tutti i filtri**. Ogni opzione
mostra quante case restano; se non resta nessuna casa, il sito propone quale richiesta togliere.

Le **schede** mostrano solo nome, comune e distanza, posti, prezzo (o "da chiedere") con la stima
di spesa per il gruppo, i servizi chiesti, e **come si contatta** la casa. Accanto, la mappa;
in alternativa l'elenco compatto ordinabile o la sola mappa.

La **scheda della casa** ha un indice delle sezioni; in primo piano c'è *Prepara la richiesta*,
che scrive il messaggio con persone e periodo e lo apre in WhatsApp o nell'email (o lo copia per
il modulo del portale), poi segna la casa come contattata. Le parti lunghe o secondarie
(altre descrizioni, tutte le informazioni delle schede, verifica di operatività) sono chiuse
all'inizio. Su telefono una barra in basso tiene sempre a portata la richiesta e la chiamata.

**Le mie case** raccoglie le case salvate, divise in liste, e le ordina per **a che punto siete**:
da contattare, aspettiamo risposta, hanno risposto, prenotata (le scartate restano in fondo,
chiuse). Ogni casa ha recapiti, stato, voto, preventivo e appunti. La vista **Confronta** affianca
le case della lista con il valore migliore di ogni riga evidenziato. Si può esportare e importare
tutto in un file (anche per confrontare le scelte di più persone), scaricare in CSV, stampare,
condividere con un link.

La pagina **Dati** (icona *i* in alto) spiega da dove vengono i dati e quali case potrebbero
non essere più operative.

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
assets/js/              moduli: app (navigazione), query (la frase con le quattro domande),
                        filters (stato, conteggi, scorciatoie, Tutti i filtri), explore (schede ed
                        elenco), map, detail (scheda e richiesta), lists (Le mie case), compare,
                        datapage, store (dati personali)
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
