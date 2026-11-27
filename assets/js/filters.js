// Stato dei filtri, applicazione, conteggi per ogni opzione e pannello dei filtri.
import { $, $$, esc, icon, norm, debounce, MON, nf, fmtEuro, nightsBetween, toast } from './util.js';
import { D, ZONE, AMB, TRATT, ALLOG, DIST, FEAT_GROUPS, featLabel, MYSTATUS, SRC, STATO, distFrom, pricePerPerson, isBusy, loadGeo } from './data.js';
import * as store from './store.js';

export function defaults() {
  return {
    q: '', grp: null, notti: null, da: '', a: '', freeOnly: true, pmin: null, pmax: null, mesi: [], zona: [], amb: [], altmin: null, altmax: null,
    reg: [], tratt: [], f: [], allog: [], prof: [], mot: [], tipi: [], gest: [], prmax: null, prknown: false, libera: false,
    origin: null, kmax: null, dist: {}, src: [], hideChiuse: true, soloAttive: false, nascondiDubbie: false, contatti: [], foto: false, video: false, cal: false,
    nuovo: false, esatta: false, list: '', mystatus: [], hideScartate: false, area: null,
  };
}
export let F = defaults();
let onApply = () => {};
export function setOnApply(fn) { onApply = fn; }
export function setFilters(obj, silent) {
  F = { ...defaults(), ...(obj || {}) }; F.area = null;
  // con un punto di partenza ha senso ordinare per distanza
  if (F.origin) SORT = 'dist'; else if (SORT === 'dist') SORT = 'rel';
  const s = document.querySelector('#sort'); if (s) s.value = SORT;
  if (!silent) { syncInputs(); apply(); }
}

// ------------------------------------------------------------ predicati
const has = (arr, v) => (arr || []).includes(v);
function stayNights() { return F.da && F.a ? Math.max(1, nightsBetween(F.da, F.a)) : (F.notti || null); }
function stayMonths() {
  if (!F.da) return [];
  const s = new Date(F.da + 'T12:00:00'), e = new Date((F.a || F.da) + 'T12:00:00'), out = new Set();
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.add(d.getMonth() + 1);
  return [...out];
}
function preds() {
  const P = [];
  const add = (key, fn) => P.push({ key, fn });
  if (F.q.trim()) {
    const toks = norm(F.q).split(/\s+/).filter(Boolean);
    add('q', h => toks.every(t => h._txt.includes(t) || (h._full && h._full.includes(t))));
  }
  if (F.grp) add('grp', h => (!h._posti || h._posti >= F.grp) && (!h.min_p || h.min_p <= F.grp));
  const nn = stayNights();
  if (nn) add('notti', h => !h.min_n || h.min_n <= nn);
  if (F.da) {
    const ms = stayMonths();
    add('date', h => (!h.mesi || ms.every(m => h.mesi.includes(m))) && !(F.freeOnly && isBusy(h, F.da, F.a)));
  }
  if (F.pmin) add('posti', h => h._posti >= F.pmin);
  if (F.pmax) add('postimax', h => (h.posti || 0) <= F.pmax);
  if (F.mesi.length) add('mesi', h => h.mesi && F.mesi.every(m => h.mesi.includes(m)));
  if (F.zona.length) add('zona', h => F.zona.includes(h.zona || 'ignota'));
  if (F.amb.length) add('amb', h => F.amb.every(a => has(h.amb, a)));
  if (F.altmin != null && F.altmin !== '') add('alt', h => h.alt != null && h.alt >= F.altmin);
  if (F.altmax != null && F.altmax !== '') add('altmax', h => h.alt != null && h.alt <= F.altmax);
  if (F.reg.length) add('reg', h => F.reg.includes(h.regione));
  if (F.tratt.length) add('tratt', h => F.tratt.some(t => has(h.tratt, t)));
  if (F.f.length) add('f', h => F.f.every(k => h._f.has(k)));
  if (F.allog.length) add('allog', h => F.allog.every(k => has(h.allog, k)));
  if (F.prof.length) add('prof', h => F.prof.some(k => has(h.prof, k)));
  if (F.mot.length) add('mot', h => F.mot.some(k => has(h.mot, k)));
  if (F.tipi.length) add('tipi', h => F.tipi.some(k => has(h.tipi, k)));
  if (F.gest.length) add('gest', h => F.gest.includes(h.gest));
  if (F.prmax) add('prezzo', h => { const p = pricePerPerson(h, F.grp); return p == null ? (!F.prknown && !h.libera ? true : h.libera) : p <= F.prmax; });
  if (F.prknown) add('prknown', h => !!h.prezzo || h.libera);
  if (F.libera) add('libera', h => h.libera);
  if (F.origin && F.kmax) add('km', h => { const d = distFrom(h, F.origin); return d != null && d <= F.kmax; });
  const ds = Object.entries(F.dist || {}).filter(([, v]) => v);
  if (ds.length) add('dist', h => ds.every(([k, v]) => h.dist && h.dist[k] != null && h.dist[k] <= v));
  if (F.src.length) add('src', h => F.src.some(s => s === 'BOTH' ? (h.src || []).length > 1 : has(h.src, s)));
  if (F.hideChiuse) add('hideChiuse', h => h.stato !== 'chiusa');
  if (F.nascondiDubbie) add('nascondiDubbie', h => h.stato !== 'dubbia');
  if (F.soloAttive) add('soloAttive', h => h.stato === 'attiva');
  if (F.contatti.length) add('contatti', h => F.contatti.every(k => contactHas(h, k)));
  if (F.foto) add('foto', h => h.nf > 0);
  if (F.video) add('video', h => h.vid > 0);
  if (F.cal) add('cal', h => !!(h.occ || h.tar));
  if (F.nuovo) add('nuovo', h => h.nuovo);
  if (F.esatta) add('esatta', h => h.geo !== 'comune');
  if (F.list) { const l = store.getList(F.list); const s = new Set(l ? l.ids : []); add('list', h => s.has(h.id)); }
  if (F.mystatus.length) add('mystatus', h => F.mystatus.includes(store.note(h.id).status || ''));
  if (F.hideScartate) add('hideScartate', h => store.note(h.id).status !== 'scartata');
  if (F.area) add('area', h => h.lat >= F.area.s && h.lat <= F.area.n && h.lon >= F.area.w && h.lon <= F.area.e);
  return P;
}
export function contactHas(h, k) {
  const c = h.c || {}, tel = c.tel || [];
  return k === 'tel' ? tel.length > 0 : k === 'cell' ? tel.some(t => t.k === 'cell') : k === 'fisso' ? tel.some(t => t.k === 'fisso') :
    k === 'wa' ? !!(c.wa && c.wa.length) : k === 'email' ? !!(c.email && c.email.length) : k === 'web' ? (!!c.web && (c.webs === 'online' || !c.webs)) :
    k === 'diretto' ? !!(tel.length || (c.email && c.email.length) || (c.wa && c.wa.length)) : false;
}

// ------------------------------------------------------------ applicazione e ordinamento
export let RESULT = [];
let P = [];
export function apply() {
  P = preds();
  RESULT = D.H.filter(h => P.every(p => p.fn(h)));
  sortResult();
  store.setLastFilters(serialize());
  renderCounts();
  renderChips();
  onApply(RESULT);
}
export let SORT = 'rel';
export function setSort(s) { SORT = s; sortResult(); onApply(RESULT); }
function sortResult() {
  const cmp = (a, b) => a.localeCompare(b, 'it');
  const nul = v => v == null ? Infinity : v;
  const o = F.origin;
  const fns = {
    rel: (a, b) => b._score - a._score || (a.posti || 0) - (b.posti || 0),
    posti_asc: (a, b) => (a.posti || 999) - (b.posti || 999), posti_desc: (a, b) => b._posti - a._posti,
    prezzo: (a, b) => nul(pricePerPerson(a, F.grp)) - nul(pricePerPerson(b, F.grp)) || b._score - a._score,
    dist: (a, b) => o ? nul(distFrom(a, o)) - nul(distFrom(b, o)) : b._score - a._score,
    alt: (a, b) => (b.alt ?? -1) - (a.alt ?? -1), nome: (a, b) => cmp(a.nome, b.nome),
    regione: (a, b) => cmp(a.regione || '', b.regione || '') || cmp(a.comune || '', b.comune || ''),
    foto: (a, b) => (b.nf || 0) - (a.nf || 0),
  };
  RESULT.sort(fns[SORT] || fns.rel);
}
const countWithout = (key, pred) => { let n = 0; for (const h of D.H) { if (!P.every(p => p.key === key || p.fn(h))) continue; if (pred(h)) n++; } return n; };
function baseWithout(keys) { return D.H.filter(h => P.every(p => keys.includes(p.key) || p.fn(h))); }

// ------------------------------------------------------------ serializzazione (link condivisibili)
export function serialize() {
  const d = defaults(), out = {};
  for (const [k, v] of Object.entries(F)) {
    if (k === 'area') continue;
    if (JSON.stringify(v) !== JSON.stringify(d[k])) out[k] = v;
  }
  return out;
}
export function toHash() { const s = JSON.stringify(serialize()); return s === '{}' ? '#/' : '#/?f=' + btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function fromHash(h) {
  const m = /[?&]f=([^&]+)/.exec(h || ''); if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
}
export const activeCount = () => Object.keys(serialize()).filter(k => !['hideChiuse'].includes(k)).length;

// ------------------------------------------------------------ pannello
const pill = (group, k, label, extra = '') => `<button type="button" class="pill" data-g="${group}" data-k="${esc(k)}" aria-pressed="false">${extra}${esc(label)} <small data-c></small></button>`;
const sec = (id, title, body, open) => `<details class="fsec" data-sec="${id}" ${open ? 'open' : ''}><summary>${title} <span class="on" data-on="${id}" hidden></span></summary><div class="fbody">${body}</div></details>`;

export function buildPanel() {
  const M = D.META, H = D.H;
  const regs = [...new Set(H.map(h => h.regione))].sort((a, b) => a.localeCompare(b, 'it'));
  const tipiC = {}; H.forEach(h => (h.tipi || []).forEach(t => tipiC[t] = (tipiC[t] || 0) + 1));
  const gestC = {}; H.forEach(h => { if (h.gest) gestC[h.gest] = (gestC[h.gest] || 0) + 1; });
  const motC = {}; H.forEach(h => (h.mot || []).forEach(t => motC[t] = (motC[t] || 0) + 1));
  const PROF_ORDER = ['GG', 'GP', 'GO', 'GS', 'SCO', 'F', 'FB', 'PE', 'C', 'S', 'U', 'L', 'SC', 'RE', 'PO', 'VF'];
  const html = [
    `<div class="fsec" data-sec="gruppo"><div class="fh">Il vostro gruppo <span class="on" data-on="gruppo" hidden></span></div><div class="fbody">
      <div class="big-num"><label>Persone<input type="number" id="f-grp" min="1" step="1" inputmode="numeric" placeholder="es. 35"></label>
      <label>Notti<input type="number" id="f-notti" min="1" step="1" inputmode="numeric" placeholder="es. 3"></label></div>
      <div class="big-num"><label>Arrivo<input type="date" id="f-da"></label><label>Partenza<input type="date" id="f-a"></label></div>
      <label class="check"><input type="checkbox" id="f-freeOnly"> Escludi le case già occupate in quelle date <small data-c="occ"></small></label>
      <p class="fhint">Restano le case con abbastanza letti, senza un minimo di presenze o notti più alto del vostro, aperte nei mesi del soggiorno. Il calendario delle prenotazioni c'è solo per le case di caseinautogestione.it.</p>
    </div></div>`,
    sec('dove', 'Dove', `
      <div class="frow"><input type="text" id="f-origin" list="comuniList" placeholder="Partite da… (comune)" autocomplete="off" aria-label="Comune di partenza"><button type="button" class="iconbtn" id="f-geoloc" title="Usa la mia posizione" aria-label="Usa la mia posizione">${icon('locate')}</button></div>
      <datalist id="comuniList"></datalist>
      <div class="frow"><label for="f-kmax">entro</label><input type="number" id="f-kmax" min="5" step="10" placeholder="qualsiasi distanza"><label>km</label></div>
      <p class="fhint">Distanza in linea d'aria. Puoi anche fare clic destro (o tenere premuto) sulla mappa.</p>
      <div class="pills">${ZONE.map(([k, l]) => pill('zona', k, l, `<span class="dot" style="background:var(--z-${k})"></span>`)).join('')}</div>
      <div class="pills">${AMB.map(([k, l]) => pill('amb', k, l)).join('')}</div>
      <div class="frow"><label for="f-altmin">quota da</label><input type="number" id="f-altmin" step="100" placeholder="m"><label for="f-altmax">a</label><input type="number" id="f-altmax" step="100" placeholder="m"></div>
      <div class="checks reglist">${regs.map(r => `<label class="check"><input type="checkbox" data-g="reg" value="${esc(r)}"> ${esc(r)} <small data-c></small></label>`).join('')}</div>
    `, true),
    sec('prezzo', 'Prezzo e posti', `
      <div class="frow"><label for="f-prmax">fino a €</label><input type="number" id="f-prmax" min="1" step="1" placeholder="qualsiasi"><label>a persona/notte</label></div>
      <label class="check"><input type="checkbox" id="f-prknown"> Solo con prezzo indicato <small data-c="prknown"></small></label>
      <label class="check"><input type="checkbox" id="f-libera"> Solo a offerta libera <small data-c="libera"></small></label>
      <p class="fhint">Il prezzo manca in molte schede: senza la spunta restano anche le case "da chiedere". Per le case con prezzo per la casa intera si divide per il vostro gruppo.</p>
      <div class="frow"><label for="f-pmin">posti da</label><input type="number" id="f-pmin" min="0" step="5" placeholder="min"><label for="f-pmax">a</label><input type="number" id="f-pmax" min="0" step="5" placeholder="max"></div>
    `, true),
    sec('must', 'Deve avere', FEAT_GROUPS.map(([g, keys]) => `<p class="fhint" style="margin-top:2px">${esc(g)}</p><div class="pills">${keys.filter(k => H.some(h => h._f.has(k))).map(k => pill('f', k, featLabel(k))).join('')}</div>`).join(''), true),
    sec('contatti', 'Contatti e affidabilità', `
      <div class="pills">${[['diretto', 'Un recapito diretto'], ['wa', 'WhatsApp'], ['cell', 'Cellulare'], ['fisso', 'Telefono fisso'], ['email', 'Email'], ['web', 'Sito online']].map(([k, l]) => pill('contatti', k, l)).join('')}</div>
      <label class="check"><input type="checkbox" id="f-hideChiuse"> Nascondi le case probabilmente chiuse <small data-c="chiusa"></small></label>
      <label class="check"><input type="checkbox" id="f-nascondiDubbie"> Nascondi quelle da verificare <small data-c="dubbia"></small></label>
      <label class="check"><input type="checkbox" id="f-soloAttive"> Solo con segnali di attività recenti <small data-c="attiva"></small></label>
      <label class="check"><input type="checkbox" id="f-foto"> Con foto <small data-c="foto"></small></label>
      <label class="check"><input type="checkbox" id="f-video"> Con video <small data-c="video"></small></label>
      <label class="check"><input type="checkbox" id="f-cal"> Con calendario o tariffe per periodo <small data-c="cal"></small></label>
      <label class="check"><input type="checkbox" id="f-esatta"> Con posizione precisa sulla mappa <small data-c="esatta"></small></label>
      <label class="check"><input type="checkbox" id="f-nuovo"> Aggiunte nell'ultimo aggiornamento <small data-c="nuovo"></small></label>
    `, true),
    sec('quando', 'Mesi di apertura', `<div class="mgrid">${MON.map((m, i) => pill('mesi', String(i + 1), m)).join('')}</div><p class="fhint">Devono essere aperte in tutti i mesi scelti (dato indicato da ${nf.format(H.filter(h => h.mesi).length)} case).</p>`),
    sec('allog', 'Alloggi e gestione', `<div class="pills">${ALLOG.map(([k, l]) => pill('allog', k, l)).join('')}</div><p class="fhint">Trattamento (basta uno):</p><div class="pills">${TRATT.map(([k, l]) => pill('tratt', k, l)).join('')}</div>`),
    sec('dist', 'Servizi vicini', `<div class="dgrid">${DIST.map(([k, l]) => `<label for="d-${k}">${l}</label><select id="d-${k}" data-dist="${k}"><option value="">qualsiasi</option><option value="0.2">≤ 200 m</option><option value="1">≤ 1 km</option><option value="5">≤ 5 km</option><option value="10">≤ 10 km</option></select>`).join('')}</div><p class="fhint">Distanze dichiarate nelle schede: con un limite restano solo le case che hanno il dato.</p>`),
    sec('prof', 'Adatta a', `<div class="pills">${PROF_ORDER.filter(k => M.codes.p[k]).map(k => pill('prof', k, M.codes.p[k])).join('')}</div><p class="fhint">Profilo ospiti di ospitalitareligiosa.it (basta uno).</p>`),
    sec('mot', 'Tipo di soggiorno', `<div class="pills">${Object.keys(M.codes.m).sort((a, b) => (motC[b] || 0) - (motC[a] || 0)).filter(k => motC[k]).map(k => pill('mot', k, M.codes.m[k])).join('')}</div>`),
    sec('tipi', 'Tipo di struttura', `<div class="pills">${Object.keys(tipiC).sort((a, b) => tipiC[b] - tipiC[a]).map(k => pill('tipi', k, k)).join('')}</div><p class="fhint">Gestita da:</p><div class="pills">${Object.keys(gestC).sort((a, b) => gestC[b] - gestC[a]).map(k => pill('gest', k, k)).join('')}</div>`),
    sec('src', 'Fonte', `<div class="pills">${[['OR', 'ospitalitareligiosa.it'], ['CIA', 'caseinautogestione.it'], ['BOTH', 'su entrambi']].map(([k, l]) => pill('src', k, l)).join('')}</div>`),
    sec('mine', 'Le mie liste', `<div class="mine-box fbody" style="margin-top:0">
      <div class="frow"><label for="f-list">Solo la lista</label><select id="f-list" style="flex:1"></select></div>
      <div class="pills">${MYSTATUS.filter(([k]) => k).map(([k, l]) => pill('mystatus', k, l)).join('')}</div>
      <label class="check"><input type="checkbox" id="f-hideScartate"> Nascondi le case che ho scartato</label></div>`),
    sec('salvate', 'Ricerche salvate', `<div id="savedSearches" class="fbody" style="margin-top:0"></div>
      <div class="frow"><button type="button" class="btn small" id="saveSearch">${icon('bookmark')} Salva questa ricerca</button><button type="button" class="btn small" id="shareSearch">${icon('link')} Copia link</button></div>`),
  ];
  $('#filtersBody').innerHTML = html.join('');
  bindPanel();
  renderSaved();
  renderListSelect();
  syncInputs();
  // la datalist dei comuni arriva dopo (file più grande)
  loadGeo().then(() => { $('#comuniList').innerHTML = D.COM.map(c => `<option value="${esc(c[0])} (${esc(c[1])})"></option>`).join(''); });
}

const NUMS = ['grp', 'notti', 'kmax', 'altmin', 'altmax', 'prmax', 'pmin', 'pmax'];
const CHKS = ['freeOnly', 'prknown', 'libera', 'hideChiuse', 'nascondiDubbie', 'soloAttive', 'foto', 'video', 'cal', 'esatta', 'nuovo', 'hideScartate'];
const ARR = ['zona', 'amb', 'reg', 'tratt', 'f', 'allog', 'prof', 'mot', 'tipi', 'gest', 'src', 'contatti', 'mesi', 'mystatus'];
const applyD = debounce(apply, 160);

function bindPanel() {
  const body = $('#filtersBody');
  body.addEventListener('click', e => {
    const b = e.target.closest('.pill[data-g]'); if (!b) return;
    const g = b.dataset.g; let k = b.dataset.k; if (g === 'mesi') k = +k;
    const arr = F[g]; const i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    b.setAttribute('aria-pressed', i < 0); apply();
  });
  body.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.g === 'reg') { const i = F.reg.indexOf(t.value); if (t.checked && i < 0) F.reg.push(t.value); if (!t.checked && i >= 0) F.reg.splice(i, 1); apply(); return; }
    if (t.dataset.dist) { F.dist = { ...F.dist, [t.dataset.dist]: t.value ? +t.value : undefined }; Object.keys(F.dist).forEach(k => F.dist[k] == null && delete F.dist[k]); apply(); return; }
  });
  NUMS.forEach(k => $('#f-' + k).addEventListener('input', e => { const v = e.target.value; F[k] = v === '' ? null : +v; if (k === 'grp') store.setPref('grp', F.grp); applyD(); }));
  CHKS.forEach(k => $('#f-' + k).addEventListener('change', e => { F[k] = e.target.checked; apply(); }));
  ['da', 'a'].forEach(k => $('#f-' + k).addEventListener('change', e => {
    F[k] = e.target.value;
    if (k === 'da' && F.a && F.a <= F.da) { F.a = ''; $('#f-a').value = ''; }
    if (F.da && F.a) { F.notti = nightsBetween(F.da, F.a); $('#f-notti').value = F.notti; }
    apply();
  }));
  $('#f-list').addEventListener('change', e => { F.list = e.target.value; apply(); });
  $('#f-origin').addEventListener('change', async e => {
    const v = e.target.value.trim(); if (!v) { setOrigin(null); return; }
    await loadGeo();
    const lv = v.toLowerCase();
    const c = D.COM.find(c => (c[0] + ' (' + c[1] + ')').toLowerCase() === lv) || D.COM.find(c => c[0].toLowerCase() === lv) || D.COM.find(c => c[0].toLowerCase().startsWith(lv));
    if (c) { e.target.value = `${c[0]} (${c[1]})`; setOrigin({ lat: c[2], lon: c[3], label: `${c[0]} (${c[1]})` }); }
    else toast('Comune non trovato: scegli dall\'elenco che compare scrivendo.');
  });
  $('#f-geoloc').onclick = () => {
    if (!navigator.geolocation) return toast('Il browser non permette di leggere la posizione.');
    navigator.geolocation.getCurrentPosition(p => { $('#f-origin').value = 'La mia posizione'; setOrigin({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'la tua posizione' }); },
      () => toast('Posizione non disponibile: scrivi il comune di partenza.'), { timeout: 10000 });
  };
  $('#saveSearch').onclick = () => {
    const name = prompt('Nome della ricerca (es. "Campo estivo 40 persone")'); if (!name) return;
    store.saveSearch(name.trim(), serialize()); renderSaved(); toast('Ricerca salvata');
  };
  $('#shareSearch').onclick = async () => {
    const url = location.origin + location.pathname + toHash();
    try { await navigator.clipboard.writeText(url); toast('Link copiato: chi lo apre vede gli stessi filtri'); }
    catch (e) { prompt('Copia il link:', url); }
  };
}
export function setOrigin(o) {
  F.origin = o; store.setPref('origin', o);
  if (o && !F.kmax) { /* niente limite: ordina per distanza */ }
  if (o) { SORT = 'dist'; const s = $('#sort'); if (s) s.value = 'dist'; }
  apply();
}
export function renderSaved() {
  const el = $('#savedSearches'); if (!el) return;
  const S = store.state().saved;
  el.innerHTML = S.length ? S.map(s => `<div class="frow"><button type="button" class="pill" data-load="${s.id}" style="flex:1;justify-content:flex-start">${icon('search')} ${esc(s.name)}</button><button type="button" class="iconbtn" data-del="${s.id}" aria-label="Elimina ricerca ${esc(s.name)}">${icon('trash')}</button></div>`).join('')
    : '<p class="fhint">Salva qui le combinazioni di filtri che usi spesso.</p>';
  el.onclick = e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (l) { const s = S.find(x => x.id === l.dataset.load); if (s) { setFilters(s.filters); toast('Ricerca "' + s.name + '" applicata'); } }
    if (d) { store.deleteSearch(d.dataset.del); renderSaved(); }
  };
}
export function renderListSelect() {
  const el = $('#f-list'); if (!el) return;
  el.innerHTML = `<option value="">tutte le case</option>` + store.lists().map(l => `<option value="${l.id}">${esc(l.name)} (${l.ids.length})</option>`).join('');
  el.value = F.list || '';
}
export function syncInputs() {
  NUMS.forEach(k => { const el = $('#f-' + k); if (el) el.value = F[k] ?? ''; });
  CHKS.forEach(k => { const el = $('#f-' + k); if (el) el.checked = !!F[k]; });
  ['da', 'a'].forEach(k => { const el = $('#f-' + k); if (el) el.value = F[k] || ''; });
  const o = $('#f-origin'); if (o) o.value = F.origin ? F.origin.label : '';
  $$('#filtersBody .pill[data-g]').forEach(b => { const g = b.dataset.g; const k = g === 'mesi' ? +b.dataset.k : b.dataset.k; b.setAttribute('aria-pressed', (F[g] || []).includes(k)); });
  $$('#filtersBody input[data-g="reg"]').forEach(i => i.checked = F.reg.includes(i.value));
  $$('#filtersBody select[data-dist]').forEach(s => s.value = F.dist[s.dataset.dist] ?? '');
  renderListSelect();
  const q = $('#q'); if (q && q.value !== F.q) q.value = F.q;
}

// conteggi accanto a ogni opzione, calcolati con tutti gli altri filtri attivi
function renderCounts() {
  const body = $('#filtersBody'); if (!body) return;
  const groups = {};
  $$('.pill[data-g]', body).forEach(b => (groups[b.dataset.g] = groups[b.dataset.g] || []).push(b));
  const keyOf = { zona: 'zona', amb: 'amb', reg: 'reg', tratt: 'tratt', f: 'f', allog: 'allog', prof: 'prof', mot: 'mot', tipi: 'tipi', gest: 'gest', src: 'src', contatti: 'contatti', mesi: 'mesi', mystatus: 'mystatus' };
  for (const [g, btns] of Object.entries(groups)) {
    const base = baseWithout([keyOf[g]]);
    const others = new Set(F[g] || []);
    for (const b of btns) {
      const k = g === 'mesi' ? +b.dataset.k : b.dataset.k;
      let n;
      const test = {
        zona: h => (h.zona || 'ignota') === k, amb: h => has(h.amb, k), tratt: h => has(h.tratt, k), allog: h => has(h.allog, k),
        prof: h => has(h.prof, k), mot: h => has(h.mot, k), tipi: h => has(h.tipi, k), gest: h => h.gest === k, mesi: h => has(h.mesi, k),
        f: h => h._f.has(k), contatti: h => contactHas(h, k), mystatus: h => (store.note(h.id).status || '') === k,
        src: h => k === 'BOTH' ? (h.src || []).length > 1 : has(h.src, k),
      }[g];
      // per i gruppi "tutti insieme" (AND) il conteggio parte dalle case che hanno già le altre scelte
      const and = ['amb', 'f', 'allog', 'contatti', 'mesi'].includes(g);
      const pool = and ? base.filter(h => [...others].filter(x => x !== k).every(x => g === 'mesi' ? has(h.mesi, x) : g === 'f' ? h._f.has(x) : g === 'contatti' ? contactHas(h, x) : has(h[g === 'amb' ? 'amb' : 'allog'], x))) : base;
      n = 0; for (const h of pool) if (test(h)) n++;
      const c = b.querySelector('[data-c]'); if (c) c.textContent = n;
      b.classList.toggle('zero', !n && b.getAttribute('aria-pressed') !== 'true');
    }
  }
  const regBase = baseWithout(['reg']); const rc = {}; regBase.forEach(h => rc[h.regione] = (rc[h.regione] || 0) + 1);
  $$('input[data-g="reg"]', body).forEach(i => { i.closest('label').querySelector('[data-c]').textContent = rc[i.value] || 0; });
  const simple = { prknown: ['prknown', h => !!h.prezzo || h.libera], libera: ['libera', h => h.libera], foto: ['foto', h => h.nf > 0], video: ['video', h => h.vid > 0],
    cal: ['cal', h => !!(h.occ || h.tar)], esatta: ['esatta', h => h.geo !== 'comune'], nuovo: ['nuovo', h => h.nuovo], attiva: ['soloAttive', h => h.stato === 'attiva'],
    chiusa: ['hideChiuse', h => h.stato === 'chiusa'], dubbia: ['nascondiDubbie', h => h.stato === 'dubbia'], occ: ['date', h => !!h.occ] };
  for (const [c, [key, fn]] of Object.entries(simple)) { const el = body.querySelector(`[data-c="${c}"]`); if (el) el.textContent = countWithout(key, fn); }
  // numero di filtri attivi per sezione
  const on = {
    gruppo: [F.grp, F.notti, F.da].filter(Boolean).length, dove: F.zona.length + F.amb.length + F.reg.length + (F.origin ? 1 : 0) + (F.altmin != null) + (F.altmax != null),
    prezzo: [F.prmax, F.prknown, F.libera, F.pmin, F.pmax].filter(Boolean).length, must: F.f.length,
    contatti: F.contatti.length + [F.soloAttive, F.nascondiDubbie, F.foto, F.video, F.cal, F.esatta, F.nuovo].filter(Boolean).length,
    quando: F.mesi.length, allog: F.allog.length + F.tratt.length, dist: Object.keys(F.dist).length, prof: F.prof.length, mot: F.mot.length,
    tipi: F.tipi.length + F.gest.length, src: F.src.length, mine: (F.list ? 1 : 0) + F.mystatus.length + (F.hideScartate ? 1 : 0),
  };
  $$('[data-on]', body).forEach(el => { const n = on[el.dataset.on] || 0; el.hidden = !n; el.textContent = n; });
  const fc = $('#fCount'); if (fc) { const n = activeCount(); fc.hidden = !n; fc.textContent = n; }
}

// chip dei filtri attivi, ciascuno rimovibile
function renderChips() {
  const el = $('#chips'); if (!el) return;
  const out = [];
  const chip = (label, undo) => { out.push([label, undo]); };
  const lab = (arr, map) => arr.map(k => map[k] || k);
  if (F.q) chip(`“${F.q}”`, () => { F.q = ''; });
  if (F.grp) chip(`${F.grp} persone`, () => { F.grp = null; });
  if (F.da) chip(`${F.da.split('-').reverse().join('/')}${F.a ? ' → ' + F.a.split('-').reverse().join('/') : ''}`, () => { F.da = ''; F.a = ''; });
  else if (F.notti) chip(`${F.notti} notti`, () => { F.notti = null; });
  if (F.origin) chip(`da ${F.origin.label}${F.kmax ? ' entro ' + F.kmax + ' km' : ''}`, () => { F.origin = null; F.kmax = null; });
  const Z = Object.fromEntries(ZONE), A = Object.fromEntries(AMB), T = Object.fromEntries(TRATT), AL = Object.fromEntries(ALLOG);
  F.zona.forEach(k => chip(Z[k], () => F.zona = F.zona.filter(x => x !== k)));
  F.amb.forEach(k => chip(A[k], () => F.amb = F.amb.filter(x => x !== k)));
  F.reg.forEach(k => chip(k, () => F.reg = F.reg.filter(x => x !== k)));
  if (F.prmax) chip(`≤ € ${F.prmax} a persona`, () => F.prmax = null);
  if (F.prknown) chip('con prezzo', () => F.prknown = false);
  if (F.libera) chip('offerta libera', () => F.libera = false);
  if (F.pmin || F.pmax) chip(`posti ${F.pmin || 0}–${F.pmax || '∞'}`, () => { F.pmin = null; F.pmax = null; });
  if (F.altmin != null || F.altmax != null) chip(`quota ${F.altmin ?? 0}–${F.altmax ?? '∞'} m`, () => { F.altmin = null; F.altmax = null; });
  F.f.forEach(k => chip(featLabel(k), () => F.f = F.f.filter(x => x !== k)));
  F.allog.forEach(k => chip(AL[k], () => F.allog = F.allog.filter(x => x !== k)));
  F.tratt.forEach(k => chip(T[k], () => F.tratt = F.tratt.filter(x => x !== k)));
  F.mesi.forEach(k => chip('aperta a ' + MON[k - 1], () => F.mesi = F.mesi.filter(x => x !== k)));
  const CL = { diretto: 'con recapito diretto', wa: 'WhatsApp', cell: 'cellulare', fisso: 'telefono fisso', email: 'email', web: 'sito online' };
  F.contatti.forEach(k => chip(CL[k], () => F.contatti = F.contatti.filter(x => x !== k)));
  Object.entries(F.dist).forEach(([k, v]) => chip(`${(DIST.find(d => d[0] === k) || [, k])[1]} ≤ ${v < 1 ? v * 1000 + ' m' : v + ' km'}`, () => { delete F.dist[k]; }));
  F.prof.forEach(k => chip(D.META.codes.p[k], () => F.prof = F.prof.filter(x => x !== k)));
  F.mot.forEach(k => chip(D.META.codes.m[k], () => F.mot = F.mot.filter(x => x !== k)));
  F.tipi.forEach(k => chip(k, () => F.tipi = F.tipi.filter(x => x !== k)));
  F.gest.forEach(k => chip(k, () => F.gest = F.gest.filter(x => x !== k)));
  F.src.forEach(k => chip(k === 'BOTH' ? 'su entrambi i portali' : SRC[k][0], () => F.src = F.src.filter(x => x !== k)));
  if (F.soloAttive) chip('solo attive', () => F.soloAttive = false);
  if (F.nascondiDubbie) chip('senza le dubbie', () => F.nascondiDubbie = false);
  if (!F.hideChiuse) chip('incluse le chiuse', () => F.hideChiuse = true);
  if (F.foto) chip('con foto', () => F.foto = false);
  if (F.video) chip('con video', () => F.video = false);
  if (F.cal) chip('con calendario', () => F.cal = false);
  if (F.esatta) chip('posizione precisa', () => F.esatta = false);
  if (F.nuovo) chip('nuove', () => F.nuovo = false);
  if (F.list) chip('lista: ' + (store.getList(F.list)?.name || ''), () => F.list = '');
  F.mystatus.forEach(k => chip('stato: ' + (MYSTATUS.find(x => x[0] === k) || [, k])[1], () => F.mystatus = F.mystatus.filter(x => x !== k)));
  if (F.hideScartate) chip('senza scartate', () => F.hideScartate = false);
  if (F.area) chip('area della mappa', () => { F.area = null; const a = $('#areaFilter'); if (a) a.checked = false; });
  el.innerHTML = out.map(([l], i) => `<span class="chip">${esc(l)}<button type="button" data-i="${i}" aria-label="Togli ${esc(l)}">${icon('x')}</button></span>`).join('') +
    (out.length > 1 ? `<button type="button" class="link" id="chipsReset">Togli tutti</button>` : '');
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { out[+b.dataset.i][1](); syncInputs(); apply(); });
  const r = $('#chipsReset'); if (r) r.onclick = () => resetAll();
}
export function resetAll() { const l = F.list; F = defaults(); syncInputs(); const a = $('#areaFilter'); if (a) a.checked = false; apply(); }
