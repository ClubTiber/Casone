// La frase in cima alla ricerca: le quattro domande che contano per ogni gruppo.
// "Siamo in [35], partiamo da [Roma, entro 150 km], [a luglio], e cerchiamo una casa [in montagna]."
// Ogni parte si apre in una piccola finestra (sul telefono, un pannello dal basso).
import { $, $$, esc, icon, nf, MON, MONL, toast, nightsBetween, plural } from './util.js';
import { D, ZONE, AMB, loadGeo } from './data.js';
import * as FL from './filters.js';
import * as store from './store.js';

const isMobile = () => matchMedia('(max-width: 900px)').matches;
const ZPHR = { mare: 'al mare', montagna: 'in montagna', collina: 'in collina', lago: 'al lago', pianura: 'in pianura', citta: 'in città', ignota: 'in zona non indicata' };
const APHR = { isolata: 'isolata', bosco: 'nel bosco', fiume: 'vicino a un fiume', terme: 'in zona termale', centro: 'in centro', semicentrale: 'semicentrale', periferia: 'in periferia' };
const joinIt = (a, last = ' e ') => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + last + a[a.length - 1];
const aMese = m => (/^[aeiou]/.test(MONL[m - 1]) ? 'ad ' : 'a ') + MONL[m - 1];

function dateTxt(da, a) {
  const d1 = new Date(da + 'T12:00:00');
  if (!a) return `dal ${d1.getDate()} ${MONL[d1.getMonth()]}`;
  const d2 = new Date(a + 'T12:00:00');
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) return `dal ${d1.getDate()} al ${d2.getDate()} ${MONL[d2.getMonth()]}`;
  return `dal ${d1.getDate()} ${MONL[d1.getMonth()]} al ${d2.getDate()} ${MONL[d2.getMonth()]}`;
}
function parts() {
  const F = FL.F;
  const n = FL.stayNights();
  const grp = F.grp ? `${nf.format(F.grp)}${n && !F.da ? `, per ${plural(n, 'notte', 'notti')}` : ''}` : (n && !F.da ? `quanti, per ${plural(n, 'notte', 'notti')}` : '');
  let from = '';
  if (F.origin) {
    const l = F.origin.label === 'la tua posizione' ? 'qui' : F.origin.label === 'punto scelto sulla mappa' ? 'un punto sulla mappa' : F.origin.label;
    from = l + (F.kmax ? `, entro ${F.kmax} km` : '');
  }
  const when = F.da ? dateTxt(F.da, F.a) : F.mesi.length ? joinIt([...F.mesi].sort((a, b) => a - b).map((m, i) => i ? MONL[m - 1] : aMese(m))) : '';
  const z = joinIt(F.zona.map(k => ZPHR[k] || k), ' o '), am = joinIt(F.amb.map(k => APHR[k] || k));
  const where = [z, am].filter(Boolean).join(', ');
  return { grp, from, when, where };
}

export function renderSentence() {
  const el = $('#sentence'); if (!el) return;
  const p = parts();
  const blank = (k, val, ph, lab) => `<span class="bk"><button type="button" class="blank ${val ? 'set' : ''}" data-q="${k}" aria-haspopup="dialog" aria-expanded="${open === k}" aria-label="${esc(lab)}: ${esc(val || 'non indicato')}">${esc(val || ph)}</button>${val ? `<button type="button" class="clr" data-clr="${k}" aria-label="Togli: ${esc(lab)}">${icon('x')}</button>` : ''}</span>`;
  const any = p.grp || p.from || p.when || p.where;
  el.innerHTML = `Siamo in ${blank('grp', p.grp, 'quanti', 'Quante persone')}, partiamo da ${blank('from', p.from, 'dove', 'Partenza')}, ${blank('when', p.when, 'in che periodo', 'Periodo')}, e cerchiamo una casa ${blank('where', p.where, 'in che zona', 'Zona')}.` +
    (any ? ` <button type="button" class="link restart" data-restart>Ricomincia</button>` : '');
}

export function bindSentence() {
  const el = $('#sentence');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-q]'), c = e.target.closest('[data-clr]'), r = e.target.closest('[data-restart]');
    if (b) { if (open === b.dataset.q) closePop(); else openPop(b.dataset.q, b); return; }
    if (c) { clear(c.dataset.clr); return; }
    if (r) { ['grp', 'from', 'when', 'where'].forEach(k => clear(k, true)); FL.syncInputs(); FL.apply(); }
  });
  $('#qscrim').onclick = closePop;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { const k = open; closePop(); const b = $(`#sentence [data-q="${k}"]`); if (b) b.focus(); } });
  document.addEventListener('pointerdown', e => {
    if (!open || isMobile()) return;
    if (e.target.closest('#qpop') || e.target.closest('#sentence [data-q]')) return;
    closePop();
  });
  $('#results').addEventListener('scroll', e => { if (!open || isMobile()) return; if (Math.abs(e.target.scrollTop - y0) > 60) closePop(); }, { passive: true });
  addEventListener('resize', () => { if (open && !isMobile()) place(); });
  FL.setOnSync(renderSentence);
  FL.onApply(() => { renderSentence(); if (open) { const b = $(`#sentence [data-q="${open}"]`); if (b) anchor = b; place(); updateFoot(); } });
}

function clear(k, silent) {
  const F = FL.F;
  if (k === 'grp') { F.grp = null; F.notti = null; store.setPref('grp', null); }
  if (k === 'from') { F.origin = null; F.kmax = null; store.setPref('origin', null); if (FL.SORT === 'dist') FL.setSort('rel'); }
  if (k === 'when') { F.mesi = []; F.da = ''; F.a = ''; }
  if (k === 'where') { F.zona = []; F.amb = []; }
  if (!silent) { FL.syncInputs(); FL.apply(); }
}

// ------------------------------------------------------------ finestre
let open = null, anchor = null, y0 = 0;
const pop = () => $('#qpop');
const stepper = (id, val, ph, label) => `<div class="stepper"><button type="button" class="iconbtn" data-step="${id}|-1" aria-label="Meno">${icon('minus')}</button><input type="number" id="${id}" inputmode="numeric" min="1" step="1" value="${val ?? ''}" placeholder="${ph}" aria-label="${label}"><button type="button" class="iconbtn" data-step="${id}|1" aria-label="Più">${icon('plus')}</button></div>`;
const zpill = (g, k, label, pre = '') => `<button type="button" class="pill" data-g="${g}" data-k="${k}" aria-pressed="false">${pre}<span>${esc(label)}</span><small data-cnt="${g}|${k}"></small></button>`;

function content(k) {
  const F = FL.F, H = D.H;
  if (k === 'grp') return `<h3>Quanti siete?</h3>
    ${stepper('qp-grp', F.grp, 'es. 35', 'Numero di persone')}
    <div class="presets">${[15, 25, 35, 50, 80, 120].map(n => `<button type="button" class="pill" data-set="grp|${n}" aria-pressed="${F.grp === n}">${n}</button>`).join('')}</div>
    <h3>Per quante notti?</h3>
    ${stepper('qp-notti', F.da && F.a ? nightsBetween(F.da, F.a) : F.notti, 'facoltativo', 'Numero di notti')}
    <p class="fhint">Restano le case con abbastanza posti letto e senza un minimo di persone o di notti più alto del vostro. Con il prezzo, vedete anche una stima della spesa.</p>`;
  if (k === 'from') return `<h3>Da dove partite?</h3>
    <div class="frow"><input type="text" id="qp-origin" list="comuniList" placeholder="Scrivi il comune" autocomplete="off" value="${esc(F.origin && !/posizione|mappa/.test(F.origin.label) ? F.origin.label : '')}" aria-label="Comune di partenza">
    <button type="button" class="btn" id="qp-geo">${icon('locate')} Qui</button></div>
    <h3>Fino a quanto lontano?</h3>
    <div class="presets">${[30, 60, 100, 150, 200, 300].map(n => `<button type="button" class="pill" data-set="kmax|${n}" aria-pressed="${F.kmax === n}">${n} km</button>`).join('')}<button type="button" class="pill" data-set="kmax|" aria-pressed="${!F.kmax}">Qualsiasi</button></div>
    <p class="fhint">Distanza in linea d'aria: su strada di solito è un terzo in più. Le case si ordinano dalla più vicina. Sulla mappa puoi scegliere un punto con il tasto destro (o tenendo premuto).</p>`;
  if (k === 'when') return `<h3>In che mese?</h3>
    <div class="mgrid">${MON.map((m, i) => zpill('mesi', i + 1, m)).join('')}</div>
    <p class="fhint">Restano le case aperte in tutti i mesi scelti. Lo indicano ${nf.format(H.filter(h => h.mesi).length)} case su ${nf.format(H.length)}; le altre restano.</p>
    <details class="exact" ${F.da ? 'open' : ''}><summary>Avete già le date?</summary>
      <div class="big-num"><label>Arrivo<input type="date" id="qp-da" value="${esc(F.da)}"></label><label>Partenza<input type="date" id="qp-a" value="${esc(F.a)}"></label></div>
      <label class="check"><input type="checkbox" data-g="bool" data-k="freeOnly"><span>Escludi le case con quelle date già prenotate</span></label>
      <p class="fhint">Il calendario delle prenotazioni c'è solo per ${nf.format(H.filter(h => h.occ).length)} case di caseinautogestione.it: per le altre bisogna chiedere.</p>
    </details>`;
  if (k === 'where') return `<h3>Che posto cercate?</h3>
    <div class="pills">${ZONE.filter(([z]) => z !== 'ignota').map(([z, l]) => zpill('zona', z, l, `<span class="dot" style="background:var(--z-${z})"></span>`)).join('')}</div>
    <p class="fhint">Basta una delle zone scelte.</p>
    <h3>E intorno?</h3>
    <div class="pills">${AMB.map(([a, l]) => zpill('amb', a, l)).join('')}</div>
    <p class="fhint">Devono avere tutto quello che scegli. Regioni e quota sono in Tutti i filtri.</p>`;
  return '';
}

export function openPop(k, btn) {
  open = k; anchor = btn; y0 = $('#results').scrollTop;
  const p = pop();
  p.innerHTML = `<div class="qp-in">${content(k)}</div><div class="qp-foot"><button type="button" class="btn quiet" data-qclear>Togli</button><button type="button" class="btn primary" data-qdone>Fatto</button></div>`;
  p.dataset.q = k;
  p.hidden = false;
  $('#qscrim').hidden = !isMobile();
  $$('#sentence [data-q]').forEach(b => b.setAttribute('aria-expanded', b.dataset.q === k));
  bindPop(k);
  FL.syncPressed(); FL.renderCounts(p);
  place(); updateFoot();
  const first = p.querySelector('input[type=number], input[type=text]');
  if (first && !isMobile()) setTimeout(() => first.focus(), 20);
  if (k === 'from') ensureComuni();
}
export function closePop() {
  if (!open) return;
  open = null; anchor = null;
  pop().hidden = true; $('#qscrim').hidden = true;
  $$('#sentence [data-q]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function place() {
  const p = pop(); if (p.hidden) return;
  if (isMobile() || !anchor || !anchor.isConnected) { p.style.left = p.style.top = ''; return; }
  const r = anchor.getBoundingClientRect(), w = p.offsetWidth;
  p.style.left = Math.max(12, Math.min(r.left - 16, innerWidth - w - 12)) + 'px';
  p.style.top = (r.bottom + 10) + 'px';
}
function updateFoot() {
  const p = pop(); if (p.hidden) return;
  const d = p.querySelector('[data-qdone]'), n = FL.RESULT.length;
  if (d) d.textContent = isMobile() ? (n ? `Mostra ${plural(n, 'casa', 'case')}` : 'Nessuna casa') : 'Fatto';
  const c = p.querySelector('[data-qclear]'); if (c) c.hidden = !parts()[{ grp: 'grp', from: 'from', when: 'when', where: 'where' }[open]];
}

function bindPop(k) {
  const p = pop(), F = FL.F;
  p.querySelector('[data-qdone]').onclick = () => { const kk = open; closePop(); const b = $(`#sentence [data-q="${kk}"]`); if (b && !isMobile()) b.focus(); };
  p.querySelector('[data-qclear]').onclick = () => { clear(k); closePop(); };
  let t;
  const num = (id, key, after) => {
    const el = p.querySelector('#' + id); if (!el) return;
    el.oninput = () => { clearTimeout(t); t = setTimeout(() => { FL.F[key] = el.value === '' ? null : Math.max(1, +el.value); after && after(); syncSet(); FL.apply(); }, 250); };
  };
  num('qp-grp', 'grp', () => store.setPref('grp', FL.F.grp));
  num('qp-notti', 'notti', () => { if (FL.F.da) { FL.F.da = ''; FL.F.a = ''; } });
  p.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const [id, d] = b.dataset.step.split('|'), el = p.querySelector('#' + id);
    const v = Math.max(1, (+el.value || (id === 'qp-grp' ? 30 : 1)) + +d);
    el.value = v; el.dispatchEvent(new Event('input'));
  });
  p.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
    const [key, v] = b.dataset.set.split('|');
    FL.F[key] = v === '' ? null : +v;
    if (key === 'grp') { store.setPref('grp', FL.F.grp); const el = p.querySelector('#qp-grp'); if (el) el.value = v; }
    if (key === 'kmax' && FL.F.kmax && !FL.F.origin) toast('Prima scrivi da dove partite');
    syncSet(); FL.apply();
  });
  const o = p.querySelector('#qp-origin');
  if (o) {
    o.onchange = async () => {
      const v = o.value.trim(); if (!v) { FL.setOrigin(null); return; }
      await loadGeo();
      const lv = v.toLowerCase();
      const c = D.COM.find(c => (c[0] + ' (' + c[1] + ')').toLowerCase() === lv) || D.COM.find(c => c[0].toLowerCase() === lv) || D.COM.find(c => c[0].toLowerCase().startsWith(lv));
      if (c) { o.value = `${c[0]} (${c[1]})`; FL.setOrigin({ lat: c[2], lon: c[3], label: `${c[0]} (${c[1]})` }); }
      else toast('Comune non trovato: sceglilo dall\'elenco che compare scrivendo.');
    };
    o.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); o.dispatchEvent(new Event('change')); } };
    p.querySelector('#qp-geo').onclick = () => {
      if (!navigator.geolocation) return toast('Il browser non permette di leggere la posizione.');
      navigator.geolocation.getCurrentPosition(pos => { o.value = ''; FL.setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'la tua posizione' }); },
        () => toast('Posizione non disponibile: scrivi il comune di partenza.'), { timeout: 10000 });
    };
  }
  ['da', 'a'].forEach(key => {
    const el = p.querySelector('#qp-' + key); if (!el) return;
    el.onchange = () => {
      FL.F[key] = el.value;
      if (key === 'da' && FL.F.a && FL.F.a <= FL.F.da) { FL.F.a = ''; p.querySelector('#qp-a').value = ''; }
      if (FL.F.da && FL.F.a) FL.F.notti = nightsBetween(FL.F.da, FL.F.a);
      FL.apply();
    };
  });
  function syncSet() { p.querySelectorAll('[data-set]').forEach(b => { const [key, v] = b.dataset.set.split('|'); b.setAttribute('aria-pressed', v === '' ? !FL.F[key] : FL.F[key] === +v); }); }
}

let comuniDone = false;
function ensureComuni() {
  if (comuniDone) return; comuniDone = true;
  loadGeo().then(() => {
    const dl = document.createElement('datalist'); dl.id = 'comuniList';
    dl.innerHTML = D.COM.map(c => `<option value="${esc(c[0])} (${esc(c[1])})"></option>`).join('');
    document.body.appendChild(dl);
  });
}
