// Vista "Esplora": schede con foto, tabella, collegamento con la mappa.
import { $, $$, esc, icon, nf, fmtEuro, monthsTxt, plural } from './util.js';
import { D, ZONEL, priceInfo, placeTxt, contactBadges, CARD_FEAT, FEAT_ICON, featLabel, distFrom, STATO, MYSTATUSL, photoFallback, tariffFor, pricePerPerson, webUsable } from './data.js';
import * as store from './store.js';
import * as M from './map.js';
import { F, RESULT, SORT } from './filters.js';

const STEP = 36;
let limit = STEP, mode = 'split', tableSort = null;
let openHouse = () => {};
export function setOpen(fn) { openHouse = fn; }
export const getMode = () => mode;

export function setMode(m) {
  mode = m; store.setPref('view', m);
  const v = $('#view-explore'); v.dataset.mode = m;
  $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  $('#cards').hidden = m === 'table'; $('#tablewrap').hidden = m !== 'table';
  render(RESULT, true); M.invalidate();
}

export function render(list, keepLimit) {
  if (!keepLimit) limit = STEP;
  const n = list.length, tot = D.H.length;
  $('#count').innerHTML = `<b>${nf.format(n)}</b>${n === 1 ? 'casa' : 'case'}${n !== tot ? ` su ${nf.format(tot)}` : ''}${F.origin ? ` · distanze da ${esc(F.origin.label)}` : ''}`;
  if (mode === 'table') renderTable(list);
  else renderCards(list);
  M.setData(list);
  M.setOrigin(F.origin, F.kmax);
}

// ------------------------------------------------------------ schede
function card(h) {
  const fav = store.isFav(h.id), cmp = store.inCompare(h.id), n = store.note(h.id);
  const p = priceInfo(h, F.grp, F.notti);
  const t = F.da ? tariffFor(h, F.da) : null;
  const d = F.origin ? distFrom(h, F.origin) : null;
  const photos = h.foto || [];
  const ph = photos.length
    ? `<img src="${esc(photos[0])}" alt="Foto di ${esc(h.nome)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-i="0" onerror="this.dataset.err=1;this.style.visibility='hidden'">` +
      (photos.length > 1 ? `<button type="button" class="nav-ph prev" data-ph="-1" aria-label="Foto precedente">${icon('chevron-left')}</button><button type="button" class="nav-ph next" data-ph="1" aria-label="Foto successiva">${icon('chevron-right')}</button><div class="dots">${photos.slice(0, 6).map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : '')
    : photoFallback(h);
  const zl = ZONEL[h.zona] || '';
  const st = h.stato === 'dubbia' || h.stato === 'chiusa' ? `<span class="st-${h.stato}">${icon('alert')}${STATO[h.stato].short}</span>` : '';
  const feats = CARD_FEAT.filter(k => h._f.has(k)).slice(0, 5);
  let priceHtml;
  if (t && (t.auto || t.semi)) priceHtml = `<span class="kf price"><b>€ ${fmtEuro(t.auto || t.semi)}</b> ${t.auto ? 'a persona nelle tue date' : 'semigestione nelle tue date'}</span>`;
  else if (p.ask) priceHtml = `<span class="kf ask">prezzo da chiedere</span>`;
  else if (p.free) priceHtml = `<span class="kf free"><b>Offerta libera</b></span>`;
  else priceHtml = `<span class="kf price" title="${esc(p.sub)}"><b>${esc(p.main)}</b> ${esc(p.unit === 'a persona / notte' ? 'a persona' : 'la casa/notte')}</span>`;
  const est = p.est ? `<span class="kf" title="Stima: prezzo × persone × notti, utenze escluse">≈ <b style="font-size:15px">€ ${nf.format(Math.round(p.est))}</b> per ${F.grp} pers.${F.notti ? ' × ' + F.notti + ' notti' : ''}</span>` : '';
  return `<article class="card" id="c-${h.id}" data-id="${h.id}">
    <div class="ph">${ph}
      <div class="tagz">${zl && h.zona !== 'ignota' ? `<span><span class="dot" style="background:var(--z-${h.zona})"></span>${esc(zl)}${h.alt ? ' ' + nf.format(h.alt) + ' m' : ''}</span>` : ''}${st}</div>
      <div class="save">
        <button type="button" class="cmp" data-cmp="${h.id}" aria-pressed="${cmp}" title="${cmp ? 'Togli dal confronto' : 'Aggiungi al confronto'}" aria-label="Confronta">${icon('columns')}</button>
        <button type="button" class="fav" data-fav="${h.id}" aria-pressed="${fav}" title="${fav ? 'Togli dalle preferite' : 'Salva nelle preferite'}" aria-label="Preferita">${icon('bookmark')}</button>
      </div>
    </div>
    <div class="cb">
      <h3><a href="#/casa/${h.id}">${esc(h.nome)}</a></h3>
      <div class="place">${esc(h.tipo ? h.tipo + ' · ' : '')}${esc(h.comune)} (${esc(h.prov)})${d != null ? ` · <b>${nf.format(Math.round(d))} km</b>` : ''}</div>
      <div class="keyfacts">
        <span class="kf"><b>${h.posti || '?'}</b> posti${h.posti_alt ? ` <span title="Sull'altro portale">(${h.posti_alt})</span>` : ''}</span>
        ${priceHtml}${est}
      </div>
      ${h.min_p || h.min_n || h.mesi ? `<div class="featline">${h.min_p ? `<span>min. ${h.min_p} persone</span>` : ''}${h.min_n ? `<span>min. ${h.min_n} notti</span>` : ''}${h.mesi && h.mesi.length < 12 ? `<span>${icon('calendar')}${esc(monthsTxt(h.mesi))}</span>` : ''}</div>` : ''}
      ${feats.length ? `<div class="featline">${feats.map(k => `<span>${icon(FEAT_ICON[k] || 'check')}${esc(featLabel(k))}</span>`).join('')}</div>` : ''}
      <div class="contacts">${contactBadges(h, 4)}${n.status ? `<span class="mystatus">${esc(MYSTATUSL[n.status])}</span>` : ''}</div>
    </div>
  </article>`;
}

function renderCards(list) {
  const el = $('#cards');
  if (!list.length) {
    el.innerHTML = `<div class="empty"><h3>Nessuna casa con questi filtri</h3><p>Molti dati sono indicati solo in parte delle schede: prova a togliere qualche requisito dai chip qui sopra.</p></div>`;
    $('#more').innerHTML = ''; return;
  }
  el.innerHTML = list.slice(0, limit).map(card).join('');
  const rest = list.length - limit;
  $('#more').innerHTML = rest > 0 ? `<button type="button" class="btn" id="moreBtn">Mostra altre ${Math.min(STEP, rest)} (ne restano ${nf.format(rest)})</button>` : '';
  const mb = $('#moreBtn'); if (mb) { mb.onclick = () => { limit += STEP; renderCards(list); }; observeMore(mb); }
}
let io;
function observeMore(btn) {
  if (!('IntersectionObserver' in window)) return;
  if (io) io.disconnect();
  io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); btn.click(); } }, { root: $('#results'), rootMargin: '600px' });
  io.observe(btn);
}

export function bindCards() {
  const el = $('#cards');
  el.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]'), c = e.target.closest('[data-cmp]'), ph = e.target.closest('[data-ph]');
    if (f) { e.preventDefault(); const on = store.toggleList('fav', f.dataset.fav); f.setAttribute('aria-pressed', on); f.title = on ? 'Togli dalle preferite' : 'Salva nelle preferite'; M.refreshIcons(); return; }
    if (c) { e.preventDefault(); const on = store.toggleCompare(c.dataset.cmp); if (on === null) { import('./util.js').then(u => u.toast('Puoi confrontare al massimo 6 case: togline una.')); return; } c.setAttribute('aria-pressed', on); return; }
    if (ph) {
      e.preventDefault();
      const card = ph.closest('.card'), h = D.byId.get(card.dataset.id), img = card.querySelector('.ph img');
      const n = (h.foto || []).length; let i = (+img.dataset.i + +ph.dataset.ph + n) % n;
      img.style.visibility = ''; img.src = h.foto[i]; img.dataset.i = i;
      card.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === Math.min(i, 5)));
      return;
    }
  });
  el.addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c && c.dataset.id !== hovered) { hovered = c.dataset.id; M.highlight(hovered); } });
  el.addEventListener('mouseleave', () => { hovered = null; M.highlight(null); });
}
let hovered = null;

export function highlightCard(id) {
  $$('.card.hl').forEach(c => c.classList.remove('hl'));
  const c = $('#c-' + id); if (c) { c.classList.add('hl'); c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ------------------------------------------------------------ tabella
const COLS = [
  ['foto', '', h => 0], ['nome', 'Nome', h => h.nome], ['comune', 'Comune', h => h.comune], ['regione', 'Regione', h => h.regione],
  ['posti', 'Posti', h => h.posti || 0], ['min', 'Min. pers.', h => h.min_p || 0], ['prezzo', '€ a pers.', h => pricePerPerson(h, F.grp) ?? 1e9],
  ['zona', 'Zona', h => h.zona], ['alt', 'Quota', h => h.alt ?? -1], ['dist', 'Km', h => F.origin ? distFrom(h, F.origin) ?? 1e9 : 0],
  ['mesi', 'Aperta', h => (h.mesi || []).length], ['contatti', 'Recapiti', h => ((h.c || {}).tel || []).length + ((h.c || {}).email || []).length * 2 + ((h.c || {}).wa || []).length],
  ['stato', 'Affidabilità', h => ({ attiva: 0, ok: 1, dubbia: 2, chiusa: 3 })[h.stato]],
];
function renderTable(list) {
  const getter = tableSort ? (COLS.find(c => c[0] === tableSort.k) || COLS[4])[2] : null;
  const rows = getter ? [...list].sort((a, b) => { const x = getter(a), y = getter(b); return (typeof x === 'string' ? x.localeCompare(y, 'it') : x - y) * tableSort.dir; }) : list;
  const shown = rows.slice(0, Math.max(limit, 200));
  $('#tablewrap').innerHTML = `<table class="grid"><thead><tr>${COLS.map(([c, l]) => { const on = tableSort && tableSort.k === c; return `<th data-k="${c}" ${on ? `aria-sort="${tableSort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${on ? (tableSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`; }).join('')}<th></th></tr></thead><tbody>
    ${shown.map(h => {
      const p = priceInfo(h, F.grp, F.notti), d = F.origin ? distFrom(h, F.origin) : null, c = h.c || {};
      const rec = [((c.tel || []).length ? icon('phone') : ''), ((c.wa || []).length ? icon('whatsapp') : ''), ((c.email || []).length ? icon('mail') : ''), (webUsable(c) ? icon('globe') : '')].join('');
      return `<tr data-id="${h.id}"><td>${h.foto && h.foto[0] ? `<img class="thumb" src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : ''}</td>
        <td><a href="#/casa/${h.id}">${esc(h.nome)}</a>${store.isFav(h.id) ? ' ' + icon('bookmark') : ''}</td><td>${esc(h.comune)} (${esc(h.prov)})</td><td>${esc(h.regione)}</td>
        <td class="n">${h.posti || '?'}</td><td class="n">${h.min_p || ''}</td><td class="n">${p.ask ? '–' : p.free ? 'libera' : esc(p.main.replace('€ ', '')) + (h.prezzo && h.prezzo.u === 'casa' ? ' /casa' : '')}</td>
        <td>${esc(ZONEL[h.zona] || '')}</td><td class="n">${h.alt ?? ''}</td><td class="n">${d != null ? Math.round(d) : ''}</td><td>${esc(monthsTxt(h.mesi))}</td><td>${rec || '<span class="small">–</span>'}</td>
        <td>${h.stato !== 'ok' ? `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>` : ''}</td>
        <td><button type="button" class="iconbtn" data-fav="${h.id}" aria-pressed="${store.isFav(h.id)}" aria-label="Preferita">${icon('bookmark')}</button></td></tr>`;
    }).join('')}</tbody></table>${rows.length > shown.length ? `<p class="small" style="text-align:center"><button type="button" class="btn" id="tblMore">Mostra tutte le ${nf.format(rows.length)}</button></p>` : ''}`;
  $('#more').innerHTML = '';
  const tm = $('#tblMore'); if (tm) tm.onclick = () => { limit = 1e6; renderTable(list); };
}
export function bindTable() {
  $('#tablewrap').addEventListener('click', e => {
    const th = e.target.closest('th[data-k]');
    if (th && th.dataset.k !== 'foto') { tableSort = { k: th.dataset.k, dir: tableSort && tableSort.k === th.dataset.k ? -tableSort.dir : 1 }; renderTable(RESULT); return; }
    const f = e.target.closest('[data-fav]');
    if (f) { const on = store.toggleList('fav', f.dataset.fav); f.setAttribute('aria-pressed', on); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) openHouse(tr.dataset.id);
  });
}
