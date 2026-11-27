// Stato dei filtri, applicazione, conteggi per ogni opzione, filtri rapidi e pannello "Tutti i filtri".
// I nomi dei campi di F restano quelli di sempre: link condivisi e ricerche salvate continuano a funzionare.
import { $, $$, esc, icon, norm, debounce, MON, nf, nightsBetween, toast, plural } from './util.js';
import { D, ZONE, AMB, TRATT, ALLOG, DIST, FEAT_GROUPS, featLabel, MYSTATUS, SRC, distFrom, pricePerPerson, isBusy } from './data.js';
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
const listeners = [];
export function onApply(fn) { listeners.push(fn); }
export function setFilters(obj, silent) {
  F = { ...defaults(), ...(obj || {}) }; F.area = null;
  // con un punto di partenza ha senso ordinare per distanza
  if (F.origin) SORT = 'dist'; else if (SORT === 'dist') SORT = 'rel';
  syncSort();
  if (!silent) { syncInputs(); apply(); }
}

// ------------------------------------------------------------ predicati
const has = (arr, v) => (arr || []).includes(v);
export function stayNights() { return F.da && F.a ? Math.max(1, nightsBetween(F.da, F.a)) : (F.notti || null); }
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
let P = [], BASES = {};
export function apply() {
  P = preds(); BASES = {};
  RESULT = D.H.filter(h => P.every(p => p.fn(h)));
  sortResult();
  store.setLastFilters(serialize());
  refreshUi();
  listeners.forEach(fn => fn(RESULT));
}
// aggiorna conteggi, pulsanti premuti e chip in tutte le parti visibili
export function refreshUi() {
  syncPressed();
  renderCounts(document.getElementById('quick'));
  const dr = document.getElementById('drawer'); if (dr && dr.open) { renderCounts(dr); renderSectionBadges(); }
  const qp = document.getElementById('qpop'); if (qp && !qp.hidden) renderCounts(qp);
  renderChips();
  renderFilterBadge();
}
export let SORT = 'rel';
export function setSort(s) { SORT = s === 'dist' && !F.origin ? 'rel' : s; syncSort(); sortResult(); listeners.forEach(fn => fn(RESULT)); }
function syncSort() {
  const s = document.querySelector('#sort'); if (!s) return;
  const d = s.querySelector('option[value="dist"]'); if (d) d.hidden = d.disabled = !F.origin;
  s.value = SORT;
}
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

// ------------------------------------------------------------ conteggi
// Ogni opzione mostra quante case resterebbero sceglendola, con tutti gli altri filtri attivi.
const TEST = {
  zona: k => h => (h.zona || 'ignota') === k, amb: k => h => has(h.amb, k), tratt: k => h => has(h.tratt, k), allog: k => h => has(h.allog, k),
  prof: k => h => has(h.prof, k), mot: k => h => has(h.mot, k), tipi: k => h => has(h.tipi, k), gest: k => h => h.gest === k, mesi: k => h => has(h.mesi, k),
  f: k => h => h._f.has(k), contatti: k => h => contactHas(h, k), mystatus: k => h => (store.note(h.id).status || '') === k, reg: k => h => h.regione === k,
  src: k => h => k === 'BOTH' ? (h.src || []).length > 1 : has(h.src, k),
};
const AND_GROUPS = ['amb', 'f', 'allog', 'contatti', 'mesi'];
// interruttori sì/no: [chiave del predicato, case contate]
export const BOOL = {
  prknown: ['prknown', h => !!h.prezzo || h.libera], libera: ['libera', h => h.libera], foto: ['foto', h => h.nf > 0], video: ['video', h => h.vid > 0],
  cal: ['cal', h => !!(h.occ || h.tar)], esatta: ['esatta', h => h.geo !== 'comune'], nuovo: ['nuovo', h => h.nuovo], soloAttive: ['soloAttive', h => h.stato === 'attiva'],
  hideChiuse: ['hideChiuse', h => h.stato === 'chiusa'], nascondiDubbie: ['nascondiDubbie', h => h.stato === 'dubbia'], freeOnly: ['date', h => !!h.occ],
  hideScartate: ['hideScartate', h => store.note(h.id).status === 'scartata'],
};
function baseFor(key) { if (!BASES[key]) BASES[key] = D.H.filter(h => P.every(p => p.key === key || p.fn(h))); return BASES[key]; }
export function optionCount(g, k) {
  if (g === 'bool') { const b = BOOL[k]; if (!b) return 0; let n = 0; for (const h of baseFor(b[0])) if (b[1](h)) n++; return n; }
  if (!TEST[g]) return 0;
  const t = TEST[g](k), and = AND_GROUPS.includes(g);
  const others = and ? (F[g] || []).filter(x => x !== k).map(x => TEST[g](x)) : [];
  let n = 0;
  for (const h of baseFor(g)) { if (!t(h)) continue; if (others.length && !others.every(fn => fn(h))) continue; n++; }
  return n;
}
export function renderCounts(root) {
  if (!root) return;
  root.querySelectorAll('[data-cnt]').forEach(el => {
    const [g, k] = el.dataset.cnt.split('|');
    const n = optionCount(g, g === 'mesi' ? +k : k);
    el.textContent = nf.format(n);
    const pill = el.closest('.pill');
    if (pill) pill.classList.toggle('zero', !n && pill.getAttribute('aria-pressed') !== 'true');
  });
}
export function syncPressed() {
  $$('[data-g][data-k]').forEach(b => {
    const g = b.dataset.g;
    const on = g === 'bool' ? !!F[b.dataset.k] : (F[g] || []).includes(g === 'mesi' ? +b.dataset.k : b.dataset.k);
    if (b.tagName === 'INPUT') b.checked = on; else b.setAttribute('aria-pressed', on);
  });
}

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

// ------------------------------------------------------------ filtri rapidi (sotto la frase)
// I servizi che contano di più per un gruppo, e i due dati che cambiano il lavoro: recapito diretto e prezzo.
export const QUICK = [
  ['contatti', 'diretto', 'Telefono o email', 'phone'],
  ['bool', 'prknown', 'Prezzo indicato', 'euro'],
  ['f', 'tende', 'Spazio per tende', 'tent'],
  ['f', 'calcio', 'Campo da calcio', 'goal'],
  ['f', 'sala_grande', 'Sala grande', 'presentation'],
  ['f', 'cucina_ind', 'Cucina industriale', 'utensils'],
  ['f', 'falo', 'Falò', 'flame'],
  ['amb', 'isolata', 'Isolata', 'mountain'],
  ['f', 'accessibilita', 'Accessibile', 'accessible'],
];
const pill = (g, k, label, pre = '') => `<button type="button" class="pill" data-g="${g}" data-k="${esc(k)}" aria-pressed="false">${pre}<span>${esc(label)}</span><small data-cnt="${g}|${esc(k)}"></small></button>`;
export function renderQuick() {
  const el = $('#quick'); if (!el) return;
  el.innerHTML = `<button type="button" class="pill allf" id="openFilters">${icon('filter')}<span>Tutti i filtri</span><b class="badge" id="fCount" hidden></b></button>` +
    QUICK.map(([g, k, l, ic]) => pill(g, k, l, icon(ic))).join('');
  $('#openFilters').onclick = openDrawer;
  syncPressed(); renderCounts(el); renderFilterBadge();
}

// ------------------------------------------------------------ elenco dei filtri attivi (chip, badge, suggerimenti)
const QUICKSET = new Set(QUICK.map(([g, k]) => g + '|' + k));
// where: 'frase' (le quattro domande), 'rapidi', 'pannello' (Tutti i filtri), 'q' (ricerca libera)
export function activeFilters() {
  const out = [];
  const add = (where, label, undo) => out.push({ where, label, undo });
  const arr = (g, map, where, prefix = '') => (F[g] || []).forEach(k => add(where || (QUICKSET.has(g + '|' + k) ? 'rapidi' : 'pannello'), prefix + (map ? map(k) : k), () => { F[g] = F[g].filter(x => x !== k); }));
  if (F.q) add('q', `“${F.q}”`, () => { F.q = ''; });
  if (F.grp) add('frase', `${F.grp} persone`, () => { F.grp = null; });
  if (F.da) add('frase', `${F.da.split('-').reverse().join('/')}${F.a ? ' → ' + F.a.split('-').reverse().join('/') : ''}`, () => { F.da = ''; F.a = ''; });
  else if (F.notti) add('frase', plural(F.notti, 'notte', 'notti'), () => { F.notti = null; });
  if (F.origin && F.kmax) add('frase', `entro ${F.kmax} km`, () => { F.kmax = null; });
  arr('mesi', k => MON[k - 1], 'frase', 'aperta a ');
  const Z = Object.fromEntries(ZONE), A = Object.fromEntries(AMB), T = Object.fromEntries(TRATT), AL = Object.fromEntries(ALLOG);
  arr('zona', k => Z[k], 'frase');
  (F.amb || []).forEach(k => add(QUICKSET.has('amb|' + k) ? 'rapidi' : 'frase', A[k] || k, () => { F.amb = F.amb.filter(x => x !== k); }));
  arr('f', featLabel);
  const CL = { diretto: 'telefono o email', wa: 'WhatsApp', cell: 'cellulare', fisso: 'telefono fisso', email: 'email', web: 'sito online' };
  arr('contatti', k => CL[k]);
  if (F.prknown) add('rapidi', 'prezzo indicato', () => { F.prknown = false; });
  arr('reg', null, 'pannello');
  if (F.prmax) add('pannello', `≤ € ${F.prmax} a persona`, () => { F.prmax = null; });
  if (F.libera) add('pannello', 'offerta libera', () => { F.libera = false; });
  if (F.pmin || F.pmax) add('pannello', `posti ${F.pmin || 0}–${F.pmax || '∞'}`, () => { F.pmin = null; F.pmax = null; });
  if (F.altmin != null || F.altmax != null) add('pannello', `quota ${F.altmin ?? 0}–${F.altmax ?? '∞'} m`, () => { F.altmin = null; F.altmax = null; });
  arr('allog', k => AL[k], 'pannello');
  arr('tratt', k => T[k], 'pannello');
  Object.entries(F.dist || {}).forEach(([k, v]) => add('pannello', `${(DIST.find(d => d[0] === k) || [, k])[1]} ≤ ${v < 1 ? v * 1000 + ' m' : v + ' km'}`, () => { F.dist = { ...F.dist }; delete F.dist[k]; }));
  arr('prof', k => D.META.codes.p[k], 'pannello');
  arr('mot', k => D.META.codes.m[k], 'pannello');
  arr('tipi', null, 'pannello');
  arr('gest', null, 'pannello');
  arr('src', k => k === 'BOTH' ? 'su entrambi i portali' : SRC[k][0], 'pannello');
  if (F.soloAttive) add('pannello', 'solo attive', () => { F.soloAttive = false; });
  if (F.nascondiDubbie) add('pannello', 'senza le dubbie', () => { F.nascondiDubbie = false; });
  if (!F.hideChiuse) add('pannello', 'anche le chiuse', () => { F.hideChiuse = true; });
  if (F.foto) add('pannello', 'con foto', () => { F.foto = false; });
  if (F.video) add('pannello', 'con video', () => { F.video = false; });
  if (F.cal) add('pannello', 'con calendario', () => { F.cal = false; });
  if (F.esatta) add('pannello', 'posizione precisa', () => { F.esatta = false; });
  if (F.nuovo) add('pannello', 'nuove', () => { F.nuovo = false; });
  if (F.list) add('pannello', 'lista: ' + (store.getList(F.list)?.name || ''), () => { F.list = ''; });
  arr('mystatus', k => (MYSTATUS.find(x => x[0] === k) || [, k])[1], 'pannello', 'stato: ');
  if (F.hideScartate) add('pannello', 'senza le scartate', () => { F.hideScartate = false; });
  if (F.area) add('pannello', 'area della mappa', () => { F.area = null; const a = $('#areaFilter'); if (a) a.checked = false; });
  return out;
}
// quante case ci sarebbero togliendo ciascun filtro: per suggerire cosa allentare
export function relaxOptions() {
  const out = [];
  for (const a of activeFilters()) {
    const snap = JSON.stringify(F);
    a.undo();
    const PP = preds();
    const n = D.H.reduce((s, h) => s + (PP.every(p => p.fn(h)) ? 1 : 0), 0);
    F = JSON.parse(snap);
    if (n > RESULT.length) out.push({ ...a, n });
  }
  return out.sort((x, y) => y.n - x.n);
}
export function undoAndApply(a) { a.undo(); syncInputs(); apply(); }

function renderChips() {
  const el = $('#chips'); if (!el) return;
  const list = activeFilters().filter(a => a.where === 'pannello' || a.where === 'q');
  el.innerHTML = list.map((a, i) => `<span class="chip">${esc(a.label)}<button type="button" data-i="${i}" aria-label="Togli ${esc(a.label)}">${icon('x')}</button></span>`).join('') +
    (list.length > 1 ? `<button type="button" class="link" data-clear>Togli questi filtri</button>` : '');
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => undoAndApply(list[+b.dataset.i]));
  const c = el.querySelector('[data-clear]'); if (c) c.onclick = () => { list.forEach(a => a.undo()); syncInputs(); apply(); };
}
function renderFilterBadge() {
  const n = activeFilters().filter(a => a.where === 'pannello').length;
  const b = $('#fCount'); if (b) { b.hidden = !n; b.textContent = n; }
  const sr = $('#showResults'); if (sr) sr.textContent = RESULT.length ? `Mostra ${plural(RESULT.length, 'casa', 'case')}` : 'Nessuna casa: togli qualche filtro';
}

// ------------------------------------------------------------ pannello "Tutti i filtri"
const sec = (id, title, body, open, hint) => `<details class="fsec" data-sec="${id}" ${open ? 'open' : ''}><summary><span>${title}</span><span class="on" data-on="${id}" hidden></span></summary><div class="fbody">${hint ? `<p class="fhint">${hint}</p>` : ''}${body}</div></details>`;
const chk = (k, label) => `<label class="check"><input type="checkbox" data-g="bool" data-k="${k}"><span>${label}</span><small data-cnt="bool|${k}"></small></label>`;
const SEC_KEYS = {
  servizi: ['f'], posti: ['pmin', 'pmax', 'allog', 'tratt'], prezzo: ['prmax', 'prknown', 'libera'], zona: ['reg', 'altmin', 'altmax', 'dist'],
  contatti: ['contatti', 'soloAttive', 'nascondiDubbie', 'hideChiuse', 'foto', 'video', 'cal', 'esatta', 'nuovo'], perchi: ['prof', 'mot'], tipo: ['tipi', 'gest', 'src'],
  mine: ['list', 'mystatus', 'hideScartate'],
};
export function buildPanel() {
  const M = D.META, H = D.H;
  const regs = [...new Set(H.map(h => h.regione))].sort((a, b) => a.localeCompare(b, 'it'));
  const tipiC = {}; H.forEach(h => (h.tipi || []).forEach(t => tipiC[t] = (tipiC[t] || 0) + 1));
  const gestC = {}; H.forEach(h => { if (h.gest) gestC[h.gest] = (gestC[h.gest] || 0) + 1; });
  const motC = {}; H.forEach(h => (h.mot || []).forEach(t => motC[t] = (motC[t] || 0) + 1));
  const PROF_ORDER = ['GG', 'GP', 'GO', 'GS', 'SCO', 'F', 'FB', 'PE', 'C', 'S', 'U', 'L', 'SC', 'RE', 'PO', 'VF'];
  const pct = n => Math.round(n / H.length * 100) + '%';
  const html = [
    sec('servizi', 'Spazi e servizi', FEAT_GROUPS.map(([g, keys]) => `<h4>${esc(g)}</h4><div class="pills">${keys.filter(k => H.some(h => h._f.has(k)) && k !== 'cucina').map(k => pill('f', k, featLabel(k))).join('')}</div>`).join(''), true,
      'Devono avere tutto quello che scegli. Quasi tutte hanno una cucina, per questo non compare.'),
    sec('posti', 'Posti e alloggi', `
      <div class="frow"><label for="f-pmin">Posti letto da</label><input type="number" id="f-pmin" data-num="pmin" min="0" step="5" placeholder="min"><label for="f-pmax">a</label><input type="number" id="f-pmax" data-num="pmax" min="0" step="5" placeholder="max"></div>
      <h4>Come si dorme</h4><div class="pills">${ALLOG.map(([k, l]) => pill('allog', k, l)).join('')}</div>
      <h4>Trattamento (basta uno)</h4><div class="pills">${TRATT.map(([k, l]) => pill('tratt', k, l)).join('')}</div>`, true),
    sec('prezzo', 'Prezzo', `
      <div class="frow"><label for="f-prmax">Fino a €</label><input type="number" id="f-prmax" data-num="prmax" min="1" step="1" placeholder="qualsiasi"><label>a persona per notte</label></div>
      ${chk('prknown', 'Solo con il prezzo indicato')}${chk('libera', 'Solo a offerta libera')}`, false,
      `Il prezzo c'è in ${pct(H.filter(h => h.prezzo || h.libera).length)} delle schede. Con un limite restano anche le case con prezzo da chiedere, a meno che non togli la spunta qui sotto. Il prezzo per la casa intera si divide per il vostro numero.`),
    sec('zona', 'Regione e dintorni', `
      <div class="reglist">${regs.map(r => `<label class="check"><input type="checkbox" data-g="reg" data-k="${esc(r)}"><span>${esc(r)}</span><small data-cnt="reg|${esc(r)}"></small></label>`).join('')}</div>
      <h4>Quota</h4><div class="frow"><label for="f-altmin">da</label><input type="number" id="f-altmin" data-num="altmin" step="100" placeholder="m"><label for="f-altmax">a</label><input type="number" id="f-altmax" data-num="altmax" step="100" placeholder="m"></div>
      <p class="fhint">La quota è indicata solo da ${nf.format(H.filter(h => h.alt != null).length)} case: con un limite restano solo quelle.</p>
      <h4>Servizi a distanza di mano</h4>
      <div class="dgrid">${DIST.map(([k, l]) => `<label for="d-${k}">${l}</label><select id="d-${k}" data-dist="${k}"><option value="">qualsiasi</option><option value="0.2">≤ 200 m</option><option value="1">≤ 1 km</option><option value="5">≤ 5 km</option><option value="10">≤ 10 km</option></select>`).join('')}</div>`),
    sec('contatti', 'Contatti e affidabilità', `
      <div class="pills">${[['diretto', 'Telefono o email'], ['wa', 'WhatsApp'], ['cell', 'Cellulare'], ['fisso', 'Telefono fisso'], ['email', 'Email'], ['web', 'Sito online']].map(([k, l]) => pill('contatti', k, l)).join('')}</div>
      <p class="fhint">Solo ${pct(H.filter(h => contactHas(h, 'diretto')).length)} delle case ha un telefono o un'email: le altre si contattano dal modulo del portale.</p>
      ${chk('hideChiuse', 'Nascondi le case probabilmente chiuse')}${chk('nascondiDubbie', 'Nascondi quelle da verificare')}${chk('soloAttive', 'Solo con segnali di attività recenti')}
      ${chk('foto', 'Con foto')}${chk('video', 'Con video')}${chk('cal', 'Con calendario o tariffe per periodo')}${chk('esatta', 'Con posizione precisa sulla mappa')}${chk('nuovo', "Aggiunte o cambiate nell'ultimo aggiornamento")}`),
    sec('perchi', 'Per chi e per cosa', `
      <h4>Accoglie (basta uno)</h4><div class="pills">${PROF_ORDER.filter(k => M.codes.p[k]).map(k => pill('prof', k, M.codes.p[k])).join('')}</div>
      <h4>Tipo di soggiorno (basta uno)</h4><div class="pills">${Object.keys(M.codes.m).sort((a, b) => (motC[b] || 0) - (motC[a] || 0)).filter(k => motC[k]).map(k => pill('mot', k, M.codes.m[k])).join('')}</div>`, false,
      'Dati presenti solo per le case di ospitalitareligiosa.it.'),
    sec('tipo', 'Tipo di struttura e fonte', `
      <div class="pills">${Object.keys(tipiC).sort((a, b) => tipiC[b] - tipiC[a]).map(k => pill('tipi', k, k)).join('')}</div>
      <h4>Gestita da</h4><div class="pills">${Object.keys(gestC).sort((a, b) => gestC[b] - gestC[a]).map(k => pill('gest', k, k)).join('')}</div>
      <h4>Portale</h4><div class="pills">${[['OR', 'ospitalitareligiosa.it'], ['CIA', 'caseinautogestione.it'], ['BOTH', 'su entrambi']].map(([k, l]) => pill('src', k, l)).join('')}</div>`),
    sec('mine', 'Le mie case', `
      <div class="frow"><label for="f-list">Solo la lista</label><select id="f-list" style="flex:1"></select></div>
      <div class="pills">${MYSTATUS.filter(([k]) => k).map(([k, l]) => pill('mystatus', k, l)).join('')}</div>
      ${chk('hideScartate', 'Nascondi le case che ho scartato')}`),
    sec('salvate', 'Ricerche salvate', `<div id="savedSearches"></div>
      <div class="frow"><button type="button" class="btn small" id="saveSearch">${icon('bookmark')} Salva questa ricerca</button><button type="button" class="btn small" id="shareSearch">${icon('link')} Copia il link</button></div>`),
  ];
  $('#filtersBody').innerHTML = html.join('');
  bindPanel();
  renderSaved();
  renderListSelect();
}

function bindPanel() {
  const dr = $('#drawer');
  dr.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dr.close());
  dr.addEventListener('click', e => { if (e.target === dr) dr.close(); });
  $('#resetAll').onclick = () => resetAll();
  const applyD = debounce(apply, 200);
  dr.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.num) { const v = t.value; F[t.dataset.num] = v === '' ? null : +v; applyD(); }
  });
  dr.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.dist) { F.dist = { ...F.dist, [t.dataset.dist]: t.value ? +t.value : undefined }; Object.keys(F.dist).forEach(k => F.dist[k] == null && delete F.dist[k]); apply(); }
  });
  $('#f-list').addEventListener('change', e => { F.list = e.target.value; apply(); });
  $('#saveSearch').onclick = () => {
    const name = prompt('Nome della ricerca (es. "Campo estivo 40 persone")'); if (!name) return;
    store.saveSearch(name.trim(), serialize()); renderSaved(); toast('Ricerca salvata');
  };
  $('#shareSearch').onclick = async () => {
    const url = location.origin + location.pathname + toHash();
    try { await navigator.clipboard.writeText(url); toast('Link copiato: chi lo apre vede la stessa ricerca'); }
    catch (e) { prompt('Copia il link:', url); }
  };
}
// clic su qualsiasi opzione (pannello, filtri rapidi, finestre della frase)
export function bindOptions() {
  document.addEventListener('click', e => {
    const b = e.target.closest('button.pill[data-g][data-k]'); if (!b) return;
    toggleOption(b.dataset.g, b.dataset.k);
  });
  document.addEventListener('change', e => {
    const t = e.target; if (t.tagName !== 'INPUT' || t.type !== 'checkbox' || !t.dataset.g || t.dataset.k == null) return;
    toggleOption(t.dataset.g, t.dataset.k, t.checked);
  });
}
export function toggleOption(g, k, want) {
  if (g === 'bool') { F[k] = want == null ? !F[k] : want; apply(); return; }
  if (g === 'mesi') k = +k;
  const arr = F[g] = [...(F[g] || [])]; const i = arr.indexOf(k);
  const on = want == null ? i < 0 : want;
  if (on && i < 0) arr.push(k); if (!on && i >= 0) arr.splice(i, 1);
  apply();
}
function renderSectionBadges() {
  const d = defaults();
  $$('#drawer [data-on]').forEach(el => {
    const n = (SEC_KEYS[el.dataset.on] || []).reduce((s, k) => {
      const v = F[k];
      if (Array.isArray(v)) return s + v.length;
      if (k === 'dist') return s + Object.keys(v || {}).length;
      return s + (JSON.stringify(v) !== JSON.stringify(d[k]) ? 1 : 0);
    }, 0);
    el.hidden = !n; el.textContent = n;
  });
}
export function openDrawer() {
  const dr = $('#drawer');
  syncInputs();
  if (!dr.open) dr.showModal();
  renderCounts(dr); renderSectionBadges(); renderFilterBadge();
}

export function setOrigin(o) {
  F.origin = o; store.setPref('origin', o);
  if (o) SORT = 'dist'; else if (SORT === 'dist') SORT = 'rel';
  syncSort();
  apply();
}
export function renderSaved() {
  const el = $('#savedSearches'); if (!el) return;
  const S = store.state().saved;
  el.innerHTML = S.length ? S.map(s => `<div class="frow"><button type="button" class="btn small quiet saved" data-load="${s.id}">${icon('search')} ${esc(s.name)}</button><button type="button" class="iconbtn" data-del="${s.id}" aria-label="Elimina ricerca ${esc(s.name)}">${icon('trash')}</button></div>`).join('')
    : '<p class="fhint">Salva qui le ricerche che usi spesso, per esempio una per ogni uscita.</p>';
  el.onclick = e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (l) { const s = S.find(x => x.id === l.dataset.load); if (s) { setFilters(s.filters); $('#drawer').close(); toast('Ricerca "' + s.name + '" applicata'); } }
    if (d) { store.deleteSearch(d.dataset.del); renderSaved(); }
  };
}
export function renderListSelect() {
  const el = $('#f-list'); if (!el) return;
  el.innerHTML = `<option value="">tutte le case</option>` + store.lists().map(l => `<option value="${l.id}">${esc(l.name)} (${l.ids.length})</option>`).join('');
  el.value = F.list || '';
}
let onSync = () => {};
export function setOnSync(fn) { onSync = fn; }
export function syncInputs() {
  $$('[data-num]').forEach(el => { el.value = F[el.dataset.num] ?? ''; });
  $$('select[data-dist]').forEach(s => s.value = F.dist[s.dataset.dist] ?? '');
  syncPressed();
  renderListSelect();
  const q = $('#q'); if (q && q.value !== F.q) q.value = F.q;
  syncSort();
  onSync();
}
export function resetAll() { F = defaults(); syncInputs(); const a = $('#areaFilter'); if (a) a.checked = false; if (SORT === 'dist') SORT = 'rel'; syncSort(); apply(); }
