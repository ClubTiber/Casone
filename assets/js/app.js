// Avvio, navigazione tra le sezioni e collegamenti tra filtri, schede e mappa.
import { $, $$, debounce, toast, icon, esc, plural } from './util.js';
import { D, loadCore, loadDetails } from './data.js';
import * as store from './store.js';
import * as FL from './filters.js';
import * as EX from './explore.js';
import * as M from './map.js';
import { openDetail, closeDetail, isOpen, setOnClose } from './detail.js';
import { renderLists, importModal, setCurrent } from './lists.js';
import { renderCompare } from './compare.js';
import { renderData } from './datapage.js';

let lastBase = '#/';
let mapReady = false;
const isMobile = () => matchMedia('(max-width: 900px)').matches;

async function boot() {
  const sprite = fetch('assets/icons.svg').then(r => r.text()).then(t => { $('#sprite').outerHTML = t; });
  try { await Promise.all([loadCore(), sprite]); }
  catch (e) { $('#cards').innerHTML = `<div class="empty"><h3>Non riesco a caricare i dati</h3><p>Ricarica la pagina. Se apri il file dal computer, avvia un piccolo server (vedi README).</p></div>`; console.error(e); return; }

  FL.buildPanel();
  const fromUrl = FL.fromHash(location.hash);
  FL.setFilters(fromUrl || store.lastFilters() || { hideChiuse: true }, true);
  if (!fromUrl && !store.lastFilters()) { const g = store.pref('grp'); if (g) FL.F.grp = g; }
  FL.syncInputs();
  $('#sort').value = 'rel';
  if (FL.F.origin) { $('#sort').value = 'dist'; FL.setSort('dist'); }

  EX.bindCards(); EX.bindTable();
  EX.setOpen(go);
  FL.setOnApply(list => { EX.render(list); });
  M.setHandlers({
    open: go,
    origin: o => { $('#f-origin').value = o.label === 'punto scelto sulla mappa' ? 'Punto sulla mappa' : o.label; FL.setOrigin(o); toast('Distanze calcolate da qui'); },
    move: debounce(b => { if ($('#areaFilter').checked) { FL.F.area = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }; FL.apply(); } }, 250),
  });
  bindUi();
  const mode = store.pref('view', 'split');
  if (!isMobile() || mode === 'map') ensureMap();
  EX.setMode(isMobile() && mode === 'map' ? 'split' : mode);
  FL.apply();
  M.legend($('#legend'));
  updateBadges();
  store.onChange(updateBadges);
  setOnClose(() => { if (location.hash.startsWith('#/casa/')) { if (history.state && history.state.fromApp) history.back(); else location.hash = lastBase; } });
  window.addEventListener('hashchange', route);
  route();
  // i testi completi servono alla ricerca libera: li carico dopo
  setTimeout(() => loadDetails().then(() => { if (FL.F.q) FL.apply(); }), 1200);
}

function go(id) { history.pushState({ fromApp: true }, '', '#/casa/' + id); route(); }

function ensureMap() {
  if (mapReady) return;
  M.initMap(); mapReady = true;
  M.setData(FL.RESULT); M.setOrigin(FL.F.origin, FL.F.kmax);
}

function bindUi() {
  $('#q').addEventListener('input', debounce(e => { FL.F.q = e.target.value; if (FL.F.q && !D.details) loadDetails().then(() => FL.apply()); FL.apply(); if (!location.hash.startsWith('#/') || /#\/(liste|confronta|dati)/.test(location.hash)) location.hash = '#/'; }, 220));
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); location.hash = '#/'; if (isMobile()) $('#q').blur(); });
  $('#sort').addEventListener('change', e => FL.setSort(e.target.value));
  $$('.seg button').forEach(b => b.onclick = () => { if (b.dataset.mode === 'map') ensureMap(); EX.setMode(b.dataset.mode); if (b.dataset.mode !== 'table') ensureMap(); });
  $('#resetAll').onclick = () => FL.resetAll();
  $('#openFilters').onclick = () => $('#filters').classList.add('open');
  $('#closeFilters').onclick = $('#showResults').onclick = () => $('#filters').classList.remove('open');
  $('#mobileToggle').onclick = () => {
    const v = $('#view-explore'); const on = !v.classList.contains('show-map');
    v.classList.toggle('show-map', on); ensureMap(); M.invalidate(on ? FL.RESULT : null);
    $('#mobileToggle').innerHTML = on ? `${icon('grid')}<span>Elenco</span>` : `${icon('map')}<span>Mappa</span>`;
  };
  $('#areaFilter').onchange = e => {
    if (e.target.checked) { const b = M.bounds(); if (b) FL.F.area = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest() }; }
    else FL.F.area = null;
    FL.apply();
  };
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; store.setPref('theme', next); themeIcon();
    if (mapReady) { M.refreshIcons(); M.themeChanged(next === 'dark'); }
  };
  themeIcon();
  $('#detail').addEventListener('close', () => { if (location.hash.startsWith('#/casa/')) closeDetail(); });
  $('#detail').addEventListener('click', e => { if (e.target.id === 'detail') closeDetail(); });
  // clic sui link interni alla scheda (case vicine) senza perdere la storia
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/casa/"]');
    if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const h = a.getAttribute('href'); if (location.hash !== h) { history.pushState({ fromApp: true }, '', h); route(); } }
  });
}
function themeIcon() {
  const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#themeBtn').innerHTML = `<svg class="ic"><use href="#i-${dark ? 'sun' : 'moon'}"/></svg>`;
}

function updateBadges() {
  const n = store.savedIds().size, c = store.compare().length;
  const a = $('#navListCount'), b = $('#navCmpCount');
  a.hidden = !n; a.textContent = n; b.hidden = !c; b.textContent = c;
  FL.renderListSelect();
}

function show(view) {
  ['explore', 'lists', 'compare', 'data'].forEach(v => { $('#view-' + v).hidden = v !== view; });
  $$('.nav a').forEach(a => { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

async function route() {
  const h = location.hash || '#/';
  if (h.startsWith('#/casa/')) {
    const id = decodeURIComponent(h.slice(7));
    if ($('#view-explore').hidden && $('#view-lists').hidden && $('#view-compare').hidden && $('#view-data').hidden) show('explore');
    await openDetail(id);
    if (mapReady) { M.highlight(id); }
    return;
  }
  if (isOpen()) closeDetail(true);
  if (h.startsWith('#/liste')) { lastBase = h; show('lists'); renderLists(); document.title = 'Le mie liste · Casone'; return; }
  if (h.startsWith('#/confronta')) { lastBase = h; show('compare'); renderCompare(); document.title = 'Confronta · Casone'; return; }
  if (h.startsWith('#/dati')) { lastBase = h; show('data'); renderData(); document.title = 'I dati · Casone'; return; }
  if (h.startsWith('#/lista')) {
    const p = new URLSearchParams(h.split('?')[1] || '');
    const ids = (p.get('ids') || '').split(',').filter(id => D.byId.has(id));
    const name = p.get('n') || 'Lista condivisa';
    location.replace('#/liste');
    if (ids.length) importModal({ app: 'casone', lists: [{ id: 'shared', name, color: store.COLORS[2], ids }], notes: {} }, name, 'separate');
    return;
  }
  // esplora
  const f = FL.fromHash(h);
  if (f) { FL.setFilters(f); history.replaceState(null, '', '#/'); }
  lastBase = '#/'; show('explore'); document.title = 'Casone · case per gruppi in autogestione';
  if (mapReady) M.invalidate();
}

// Le foto di caseinautogestione.it a volte vengono rifiutate (errore 415) quando le chiede un altro sito:
// si riprova con calma e con le altre misure che il portale offre, e si nasconde la foto solo se falliscono tutte.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const src = img.getAttribute('src') || '';
  if (!/caseinautogestione\.it\/image\.php/.test(src)) return;
  const n = +(img.dataset.retry || 0);
  if (n >= 4) return; // lascia agire il gestore della pagina (nasconde la foto)
  e.stopPropagation();
  img.dataset.retry = n + 1;
  const base = src.replace(/\?(part|resize)\([^)]*\)$/, '');
  const next = [src, base + '?part(800x480)', base + '?resize(1280x768)', base + '?part(480x300)'][n];
  setTimeout(() => { if (img.isConnected) img.src = next; }, 500 + n * 700);
}, true);

boot();
