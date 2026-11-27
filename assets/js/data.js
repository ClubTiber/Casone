// Caricamento dei dati e vocabolario condiviso (etichette, colori, formati).
import { norm, fmtEuro, hav, esc, icon } from './util.js';

export const D = { H: [], byId: new Map(), META: null, details: null, COM: null, ITA: null };

let detailsP = null, geoP = null;
export async function loadCore() {
  const [H, META] = await Promise.all([fetch('data/houses.json').then(r => r.json()), fetch('data/meta.json').then(r => r.json())]);
  D.H = H; D.META = META;
  H.forEach(prep);
  D.byId = new Map(H.map(h => [h.id, h]));
  return D;
}
export function loadDetails() {
  if (!detailsP) detailsP = fetch('data/details.json').then(r => r.json()).then(d => {
    D.details = d;
    // il testo completo entra nella ricerca libera
    for (const h of D.H) {
      const x = d[h.id]; if (!x) continue;
      h._full = norm([x.sintesi, ...(x.descr_or || []), ...(x.descr_cia || []), ...((x.sito && x.sito.testo) || []), x.vicino, x.esterni, x.sport, x.cucina, x.regole].filter(Boolean).join(' '));
    }
    return d;
  });
  return detailsP;
}
export function loadGeo() {
  if (!geoP) geoP = Promise.all([fetch('data/comuni.json').then(r => r.json()), fetch('data/italy.json').then(r => r.json())]).then(([C, I]) => { D.COM = C; D.ITA = I; return D; });
  return geoP;
}

export const ZONE = [['mare', 'Mare'], ['montagna', 'Montagna'], ['collina', 'Collina'], ['lago', 'Lago'], ['pianura', 'Pianura'], ['citta', 'Città'], ['ignota', 'Non indicata']];
export const ZONEL = Object.fromEntries(ZONE);
export const zoneColor = z => getComputedStyle(document.documentElement).getPropertyValue('--z-' + (z || 'ignota')).trim() || '#888';
export const AMB = [['isolata', 'Isolata'], ['bosco', 'Nel bosco'], ['fiume', 'Vicino a un fiume'], ['terme', 'Zona termale'], ['centro', 'In centro paese/città'], ['semicentrale', 'Semicentrale'], ['periferia', 'Periferia']];
export const TRATT = [['auto', 'Autogestione'], ['semi', 'Semigestione / gestione mediata'], ['pens', 'Pensione / mezza pensione'], ['pern', 'Pernottamento / B&B']];
export const TRATTL = Object.fromEntries(TRATT);
export const ALLOG = [['camerate', 'Camerate'], ['multiple', 'Triple/multiple'], ['doppie', 'Doppie'], ['singole', 'Singole'], ['sacchi', 'Posti per sacchi a pelo'], ['tende', 'Spazio per tende'], ['bungalow', 'Bungalow'], ['cam_disabili', 'Camere per disabili']];
export const ALLOGL = Object.fromEntries(ALLOG);
export const DIST = [['super', 'Supermercato'], ['bus', 'Fermata bus'], ['treno', 'Stazione treni'], ['farmacia', 'Farmacia'], ['ospedale', 'Ospedale'], ['chiesa', 'Chiesa'], ['mare', 'Mare/spiaggia']];
export const DISTL = { super: 'Supermercato', bus: 'Fermata bus', treno: 'Stazione treni', farmacia: 'Farmacia', ospedale: 'Ospedale', chiesa: 'Chiesa', bar: 'Bar/ristoranti', abitato: 'Zona abitata', mare: 'Mare/spiaggia', metro: 'Metropolitana', bancomat: 'Bancomat', aeroporto: 'Aeroporto' };
export const STATO = {
  attiva: { l: 'Segnali di attività recenti', short: 'Attiva', cls: 'good' },
  ok: { l: 'Nessun segnale contrario', short: 'Nessuna anomalia', cls: '' },
  dubbia: { l: 'Da verificare: forse non più operativa', short: 'Da verificare', cls: 'warn' },
  chiusa: { l: 'Probabilmente chiusa o sospesa', short: 'Forse chiusa', cls: 'bad' },
};
export const SRC = { OR: ['ospitalitareligiosa.it', 'Ospitalità Religiosa'], CIA: ['caseinautogestione.it', 'Case in Autogestione'] };
export const MYSTATUS = [['', 'Nessuno stato'], ['da_contattare', 'Da contattare'], ['contattata', 'Contattata'], ['in_attesa', 'In attesa di risposta'], ['disponibile', 'Disponibile'], ['preventivo', 'Preventivo ricevuto'], ['confermata', 'Prenotata'], ['scartata', 'Scartata']];
export const MYSTATUSL = Object.fromEntries(MYSTATUS);

// funzionalità raggruppate per la scheda e i filtri, con icona
export const FEAT_GROUPS = [
  ['In casa', ['cucina', 'cucina_ind', 'lavastoviglie', 'lavatrice', 'sala', 'sala_grande', 'proiettore', 'audio', 'chiesa', 'riscaldamento', 'caminetto', 'aria', 'wifi', 'rete', 'tv', 'biancheria', 'bagno_camera', 'ascensore', 'biblioteca']],
  ['All\'aperto', ['giardino', 'area_giochi', 'sport', 'calcio', 'pallavolo', 'basket', 'tennis', 'piscina', 'falo', 'bbq', 'bosco', 'spiaggia', 'tende', 'recintato', 'bici']],
  ['Accesso e servizi', ['parcheggio', 'pullman', 'mezzi', 'accessibilita', 'bagni_disabili', 'carte', 'pasto', 'animali']],
];
export const FEAT_ICON = { cucina: 'utensils', cucina_ind: 'utensils', sala: 'presentation', sala_grande: 'presentation', proiettore: 'presentation', chiesa: 'church', riscaldamento: 'heater', caminetto: 'flame', wifi: 'wifi', giardino: 'trees', bosco: 'trees', sport: 'goal', calcio: 'goal', pallavolo: 'goal', basket: 'goal', tennis: 'goal', piscina: 'pool', falo: 'flame', bbq: 'flame', spiaggia: 'waves', tende: 'tent', parcheggio: 'car', pullman: 'bus', mezzi: 'train', accessibilita: 'accessible', bagni_disabili: 'accessible' };
// le più utili da mostrare sulle schede (in quest'ordine)
export const CARD_FEAT = ['cucina_ind', 'sala', 'calcio', 'giardino', 'falo', 'tende', 'piscina', 'chiesa', 'wifi', 'accessibilita', 'pullman', 'riscaldamento'];
export const featLabel = k => (D.META && D.META.feat[k]) || k;

export function prep(h) {
  h._txt = norm([h.nome, h.tipo, (h.tipi || []).join(' '), h.comune, h.prov, h.regione, h.ind, h.gest].join(' '));
  h._f = new Set(h.f || []);
  h._dec = h.mesi ? h.mesi.includes(12) : null;
  h._posti = Math.max(h.posti || 0, h.posti_alt || 0);
  h._price = h.prezzo && h.prezzo.u === 'persona' ? h.prezzo.v : null;
  h._phones = (h.c && h.c.tel) || [];
  h._occ = h.occ ? h.occ : null;
  // completezza: serve per l'ordinamento "più complete"
  h._score = (h.nf ? Math.min(h.nf, 8) * 2 : 0) + (h.prezzo ? 8 : 0) + (h._phones.length ? 6 : 0) + ((h.c && h.c.email) ? 4 : 0) + ((h.c && h.c.wa) ? 3 : 0) +
    (h.geo === 'esatta' ? 3 : 0) + (h.stato === 'attiva' ? 5 : 0) + (h.stato === 'dubbia' ? -6 : 0) + (h.stato === 'chiusa' ? -20 : 0) + (h.vid ? 2 : 0) + (h.mesi ? 1 : 0);
}

export function placeTxt(h) { return `${h.comune}${h.prov ? ' (' + h.prov + ')' : ''} · ${h.regione}`; }

export function priceInfo(h, grp, nights) {
  // restituisce {main, unit, sub, ask, est} per schede e confronti
  const p = h.prezzo;
  if (p) {
    const circa = p.circa || p.t === 'testo' ? 'circa ' : '';
    const range = p.max && p.max !== p.v ? `–${fmtEuro(p.max)}` : '';
    const what = p.t === 'semi' ? 'semigestione' : p.t === 'testo' ? (p.f === 'sito web' ? 'dal sito web' : 'dalla descrizione') : p.t === 'da' ? 'a partire da' : 'autogestione';
    let est = null;
    if (grp && p.u === 'persona') est = p.v * grp * (nights || 1);
    if (grp && p.u === 'casa') est = p.v * (nights || 1);
    return {
      main: `€ ${fmtEuro(p.v)}${range}`, unit: p.u === 'casa' ? 'casa intera / notte' : 'a persona / notte', sub: `${circa}${what}`, est,
      perPerson: p.u === 'persona' ? p.v : (grp ? p.v / grp : null),
    };
  }
  if (h.libera) return { main: 'Offerta libera', unit: '', sub: 'più eventuali utenze', free: true };
  return { main: 'Prezzo da chiedere', ask: true, unit: '', sub: '' };
}

export function pricePerPerson(h, grp) {
  const p = h.prezzo; if (!p) return null;
  if (p.u === 'persona') return p.v;
  if (p.u === 'casa') return grp ? p.v / grp : (h.posti ? p.v / h.posti : null);
  return null;
}

// prezzo dalle tariffe per periodo (caseinautogestione.it) se le date cadono in un periodo
export function tariffFor(h, isoDate) {
  if (!h.tar || !isoDate) return null;
  const d = new Date(isoDate + 'T12:00:00'), dm = (d.getMonth() + 1) * 100 + d.getDate();
  for (const t of h.tar) {
    if (!t.da || !t.a) continue;
    const a = t.da[1] * 100 + t.da[0], b = t.a[1] * 100 + t.a[0];
    if (a <= b ? (dm >= a && dm <= b) : (dm >= a || dm <= b)) return t;
  }
  return null;
}

export function isBusy(h, da, a) {
  // true se almeno una notte tra da (incluso) e a (escluso) è segnata come occupata
  if (!h.occ || !da) return false;
  const end = a || da;
  for (const [s, e] of h.occ) { if (s < (a ? end : addOne(end)) && e >= da) return true; }
  return false;
}
function addOne(iso) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

export function distFrom(h, o) { return o && h.lat != null ? hav(o.lat, o.lon, h.lat, h.lon) : null; }

// il sito si può linkare? (no se il dominio non esiste più, è parcheggiato o rimanda altrove)
export const webUsable = c => !!(c && c.web && !['dominio_inesistente', 'parcheggiato', 'reindirizzato'].includes(c.webs));
export function phoneHref(n) { return 'tel:' + n.replace(/[^\d+]/g, ''); }
export function waHref(n, text) { const d = n.replace(/\D/g, ''); return `https://wa.me/${d.startsWith('39') ? d : '39' + d}${text ? '?text=' + encodeURIComponent(text) : ''}`; }
export function webLabel(u) { return (u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''); }
export function photoFallback(h) {
  return `<div class="noph"><b>${h.posti || '?'}</b><span>posti letto${h.nf ? '' : ' · nessuna foto'}</span></div>`;
}
export function contactBadges(h, max = 4) {
  const c = h.c || {}, out = [];
  const tel = c.tel || [];
  const cell = tel.find(t => t.k === 'cell'), fisso = tel.find(t => t.k === 'fisso') || tel.find(t => t.k !== 'cell');
  if (c.wa && c.wa.length) out.push(`<a class="wa" href="${esc(waHref(c.wa[0]))}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.wa[0])}">${icon('whatsapp')}WhatsApp</a>`);
  if (cell) out.push(`<a href="${esc(phoneHref(cell.n))}" title="Cellulare ${esc(cell.n)}">${icon('smartphone')}Cell.</a>`);
  if (fisso) out.push(`<a href="${esc(phoneHref(fisso.n))}" title="Telefono ${esc(fisso.n)}">${icon('phone')}Tel.</a>`);
  if (c.email && c.email.length) out.push(`<a href="mailto:${esc(c.email[0])}" title="${esc(c.email[0])}">${icon('mail')}Email</a>`);
  if (webUsable(c)) out.push(`<a href="${esc(c.web)}" target="_blank" rel="noopener" title="${esc(webLabel(c.web))}">${icon('globe')}Sito</a>`);
  if (!out.length) {
    if ((h.src || []).includes('CIA')) out.push(`<span class="none">Si contatta dal portale caseinautogestione.it</span>`);
    else if (c.form) out.push(`<span class="none">Modulo di contatto sul portale</span>`);
    else out.push(`<span class="none">Recapiti da cercare</span>`);
  }
  return out.slice(0, max).join('');
}
