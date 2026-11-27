// Vista "Cerca": schede con foto, elenco compatto, collegamento con la mappa.
import { $, $$, esc, icon, nf, fmtEuro, monthsTxt, plural, fmtDate, toast } from './util.js';
import { D, ZONEL, priceInfo, CARD_FEAT, FEAT_ICON, featLabel, distFrom, STATO, MYSTATUSL, photoFallback, tariffFor, pricePerPerson, webUsable, phoneHref, waHref, webLabel } from './data.js';
import * as store from './store.js';
import * as M from './map.js';
import * as FL from './filters.js';

const STEP = 30;
let limit = STEP, mode = 'split', tableSort = null;
let openHouse = () => {}, onSaveMenu = () => {};
export function setOpen(fn) { openHouse = fn; }
export function setSaveMenu(fn) { onSaveMenu = fn; }
export const getMode = () => mode;

export function setMode(m) {
  mode = m; store.setPref('view', m);
  const v = $('#view-explore'); v.dataset.mode = m;
  $$('.seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  $('#cards').hidden = m === 'table'; $('#tablewrap').hidden = m !== 'table';
  render(FL.RESULT, true); M.invalidate();
}

export function render(list, keepLimit) {
  if (!keepLimit) limit = STEP;
  const n = list.length, tot = D.H.length, F = FL.F;
  $('#count').innerHTML = `<b>${nf.format(n)}</b> ${n === 1 ? 'casa' : 'case'}${n !== tot ? ` <span>su ${nf.format(tot)}</span>` : ''}`;
  if (mode === 'table') renderTable(list);
  else renderCards(list);
  M.setData(list);
  M.setOrigin(F.origin, F.kmax);
}

// ------------------------------------------------------------ schede
function reach(h) {
  // come si contatta: è l'informazione che più cambia il lavoro (solo una casa su cinque ha telefono o email)
  const c = h.c || {}, out = [];
  const tel = c.tel || [];
  const cell = tel.find(t => t.k === 'cell'), fisso = tel.find(t => t.k !== 'cell');
  if (c.wa && c.wa.length) out.push(`<a class="wa" href="${esc(waHref(c.wa[0]))}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.wa[0])}">${icon('whatsapp')}WhatsApp</a>`);
  if (cell && !(c.wa && c.wa.length)) out.push(`<a href="${esc(phoneHref(cell.n))}" title="Cellulare ${esc(cell.n)}">${icon('smartphone')}Cellulare</a>`);
  else if (fisso || cell) out.push(`<a href="${esc(phoneHref((fisso || cell).n))}" title="Telefono ${esc((fisso || cell).n)}">${icon('phone')}Telefono</a>`);
  if (c.email && c.email.length) out.push(`<a href="mailto:${esc(c.email[0])}" title="${esc(c.email[0])}">${icon('mail')}Email</a>`);
  if (out.length) return `<div class="reach">${out.slice(0, 3).join('')}</div>`;
  const how = (h.src || []).includes('CIA') && !c.form ? 'Si contatta dal portale caseinautogestione.it' : c.form ? 'Si contatta dal modulo del portale' : webUsable(c) ? 'Recapiti sul sito della casa' : 'Recapiti da cercare';
  return `<div class="reach none">${icon('message')}${how}</div>`;
}
function card(h) {
  const F = FL.F, fav = store.savedIds().has(h.id), n = store.note(h.id);
  const p = priceInfo(h, F.grp, FL.stayNights());
  const t = F.da ? tariffFor(h, F.da) : null;
  const d = F.origin ? distFrom(h, F.origin) : null;
  const photos = h.foto || [];
  const ph = photos.length
    ? `<img src="${esc(photos[0])}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-i="0" onerror="this.dataset.err=1;this.style.visibility='hidden'">` +
      (photos.length > 1 ? `<button type="button" class="nav-ph prev" data-ph="-1" aria-label="Foto precedente">${icon('chevron-left')}</button><button type="button" class="nav-ph next" data-ph="1" aria-label="Foto successiva">${icon('chevron-right')}</button><div class="dots">${photos.slice(0, 6).map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : '')
    : photoFallback(h);
  const zl = ZONEL[h.zona] || '';
  const warn = h.stato === 'dubbia' || h.stato === 'chiusa' ? `<span class="st-${h.stato}">${icon('alert')}${STATO[h.stato].short}</span>` : '';
  // servizi: prima quelli chiesti nei filtri, poi i più utili per un gruppo
  const want = (F.f || []).filter(k => h._f.has(k));
  const feats = [...want, ...CARD_FEAT.filter(k => h._f.has(k) && !want.includes(k))].slice(0, 3);
  let price;
  if (t && (t.auto || t.semi)) price = `<span class="pr"><b>€ ${fmtEuro(t.auto || t.semi)}</b> a persona nelle vostre date</span>`;
  else if (p.ask) price = `<span class="pr ask">prezzo da chiedere</span>`;
  else if (p.free) price = `<span class="pr"><b>offerta libera</b></span>`;
  else price = `<span class="pr" title="${esc(p.sub)}"><b>${esc(p.main)}</b> ${p.unit === 'a persona / notte' ? 'a persona' : 'la casa per notte'}</span>`;
  const est = p.est ? `<p class="est" title="Prezzo indicato per persone e notti: utenze, riscaldamento e pulizie di solito sono a parte">circa <b>€ ${nf.format(Math.round(p.est))}</b> per ${F.grp} persone${FL.stayNights() ? ` e ${plural(FL.stayNights(), 'notte', 'notti')}` : ' a notte'}</p>` : '';
  const mins = [h.min_p ? `minimo ${h.min_p} persone` : '', h.min_n ? `minimo ${plural(h.min_n, 'notte', 'notti')}` : '', h.mesi && h.mesi.length < 12 ? `aperta ${monthsTxt(h.mesi)}` : ''].filter(Boolean);
  return `<article class="card" id="c-${h.id}" data-id="${h.id}">
    <div class="ph">${ph}
      <div class="tagz">${zl && h.zona !== 'ignota' ? `<span><span class="dot" style="background:var(--z-${h.zona})"></span>${esc(zl)}${h.alt ? ' ' + nf.format(h.alt) + ' m' : ''}</span>` : ''}${warn}</div>
      <button type="button" class="fav" data-fav="${h.id}" aria-pressed="${fav}" title="${fav ? 'Nelle tue liste' : 'Salva nelle Preferite'}" aria-label="${fav ? 'Salvata: scegli le liste' : 'Salva nelle Preferite'}">${icon('bookmark')}</button>
    </div>
    <div class="cb">
      <h3><a href="#/casa/${h.id}">${esc(h.nome)}</a></h3>
      <p class="place">${esc(h.comune)} (${esc(h.prov)})${d != null ? ` <span class="km">${nf.format(Math.round(d))} km</span>` : ''}</p>
      <p class="keys"><span class="po"><b>${h.posti || '?'}</b> posti</span>${price}</p>
      ${est}
      ${mins.length ? `<p class="mins">${esc(mins.join(', '))}</p>` : ''}
      ${feats.length ? `<p class="feats">${feats.map(k => `<span class="${want.includes(k) ? 'want' : ''}">${icon(FEAT_ICON[k] || 'check')}${esc(featLabel(k))}</span>`).join('')}</p>` : ''}
      ${reach(h)}
      ${n.status ? `<span class="mystatus">${esc(MYSTATUSL[n.status])}</span>` : ''}
    </div>
  </article>`;
}

function renderCards(list) {
  const el = $('#cards');
  if (!list.length) { el.innerHTML = emptyState(); $('#more').innerHTML = ''; bindEmpty(); return; }
  el.innerHTML = list.slice(0, limit).map(card).join('');
  const rest = list.length - limit;
  $('#more').innerHTML = rest > 0 ? `<button type="button" class="btn" id="moreBtn">Mostra altre ${Math.min(STEP, rest)} (ne restano ${nf.format(rest)})</button>` : '';
  const mb = $('#moreBtn'); if (mb) { mb.onclick = () => { limit += STEP; renderCards(list); }; observeMore(mb); }
}
let relax = [];
function emptyState() {
  relax = FL.relaxOptions().slice(0, 5);
  return `<div class="empty"><h3>Nessuna casa con queste richieste</h3>
    ${relax.length ? `<p>Prova a togliere una richiesta:</p><div class="relax">${relax.map((r, i) => `<button type="button" class="btn" data-relax="${i}">${icon('x')} ${esc(r.label)} <small>${plural(r.n, 'casa', 'case')}</small></button>`).join('')}</div>`
      : '<p>Molti dati ci sono solo in una parte delle schede: prova con meno filtri.</p>'}</div>`;
}
function bindEmpty() { $$('[data-relax]').forEach(b => b.onclick = () => FL.undoAndApply(relax[+b.dataset.relax])); }
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
    const f = e.target.closest('[data-fav]'), ph = e.target.closest('[data-ph]');
    if (f) { e.preventDefault(); toggleSave(f.dataset.fav, f); return; }
    if (ph) {
      e.preventDefault();
      const card = ph.closest('.card'), h = D.byId.get(card.dataset.id), img = card.querySelector('.ph img');
      const n = (h.foto || []).length; const i = (+img.dataset.i + +ph.dataset.ph + n) % n;
      img.style.visibility = ''; img.src = h.foto[i]; img.dataset.i = i;
      card.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j === Math.min(i, 5)));
    }
  });
  el.addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c && c.dataset.id !== hovered) { hovered = c.dataset.id; M.highlight(hovered); } });
  el.addEventListener('mouseleave', () => { hovered = null; M.highlight(null); });
}
let hovered = null;
// segnalibro: la prima volta salva nelle Preferite; se è già in una lista apre la scelta delle liste
function toggleSave(id, btn) {
  if (store.savedIds().has(id)) { onSaveMenu(id, () => syncSaved(id)); return; }
  store.toggleList('fav', id, true); syncSaved(id);
  toast('Salvata nelle Preferite', { label: 'Altre liste', run: () => onSaveMenu(id, () => syncSaved(id)) });
}
function syncSaved(id) {
  const on = store.savedIds().has(id);
  $$(`[data-fav="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', on); b.title = on ? 'Nelle tue liste' : 'Salva nelle Preferite'; });
  M.refreshIcons();
}

export function highlightCard(id) {
  $$('.card.hl').forEach(c => c.classList.remove('hl'));
  const c = $('#c-' + id); if (c) { c.classList.add('hl'); c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

// ------------------------------------------------------------ elenco compatto
const COLS = [
  ['foto', '', h => 0], ['nome', 'Nome', h => h.nome], ['comune', 'Comune', h => h.comune], ['regione', 'Regione', h => h.regione],
  ['posti', 'Posti', h => h.posti || 0], ['min', 'Min. pers.', h => h.min_p || 0], ['prezzo', '€ a pers.', h => pricePerPerson(h, FL.F.grp) ?? 1e9],
  ['zona', 'Zona', h => h.zona], ['alt', 'Quota', h => h.alt ?? -1], ['dist', 'Km', h => FL.F.origin ? distFrom(h, FL.F.origin) ?? 1e9 : 0],
  ['mesi', 'Aperta', h => (h.mesi || []).length], ['contatti', 'Recapiti', h => ((h.c || {}).tel || []).length + ((h.c || {}).email || []).length * 2 + ((h.c || {}).wa || []).length],
  ['stato', 'Affidabilità', h => ({ attiva: 0, ok: 1, dubbia: 2, chiusa: 3 })[h.stato]],
];
function renderTable(list) {
  const F = FL.F;
  const getter = tableSort ? (COLS.find(c => c[0] === tableSort.k) || COLS[4])[2] : null;
  const rows = getter ? [...list].sort((a, b) => { const x = getter(a), y = getter(b); return (typeof x === 'string' ? x.localeCompare(y, 'it') : x - y) * tableSort.dir; }) : list;
  const shown = rows.slice(0, Math.max(limit, 200));
  if (!list.length) { $('#tablewrap').innerHTML = emptyState(); bindEmpty(); $('#more').innerHTML = ''; return; }
  const cols = COLS.filter(c => c[0] !== 'dist' || F.origin);
  $('#tablewrap').innerHTML = `<table class="grid"><thead><tr>${cols.map(([c, l]) => { const on = tableSort && tableSort.k === c; return `<th data-k="${c}" ${on ? `aria-sort="${tableSort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${on ? (tableSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`; }).join('')}<th><span class="vh">Salva</span></th></tr></thead><tbody>
    ${shown.map(h => {
      const p = priceInfo(h, F.grp, FL.stayNights()), d = F.origin ? distFrom(h, F.origin) : null, c = h.c || {};
      const rec = [((c.tel || []).length ? icon('phone') : ''), ((c.wa || []).length ? icon('whatsapp') : ''), ((c.email || []).length ? icon('mail') : ''), (webUsable(c) ? icon('globe') : '')].join('');
      return `<tr data-id="${h.id}"><td>${h.foto && h.foto[0] ? `<img class="thumb" src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : ''}</td>
        <td><a href="#/casa/${h.id}">${esc(h.nome)}</a></td><td>${esc(h.comune)} (${esc(h.prov)})</td><td>${esc(h.regione)}</td>
        <td class="n">${h.posti || '?'}</td><td class="n">${h.min_p || ''}</td><td class="n">${p.ask ? '–' : p.free ? 'libera' : esc(p.main.replace('€ ', '')) + (h.prezzo && h.prezzo.u === 'casa' ? ' /casa' : '')}</td>
        <td>${esc(ZONEL[h.zona] || '')}</td><td class="n">${h.alt ?? ''}</td>${F.origin ? `<td class="n">${d != null ? Math.round(d) : ''}</td>` : ''}<td>${esc(monthsTxt(h.mesi))}</td><td class="rec">${rec || '<span class="small">modulo</span>'}</td>
        <td>${h.stato !== 'ok' ? `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>` : ''}</td>
        <td><button type="button" class="iconbtn fav" data-fav="${h.id}" aria-pressed="${store.savedIds().has(h.id)}" aria-label="Salva">${icon('bookmark')}</button></td></tr>`;
    }).join('')}</tbody></table>${rows.length > shown.length ? `<p class="small" style="text-align:center"><button type="button" class="btn" id="tblMore">Mostra tutte le ${nf.format(rows.length)}</button></p>` : ''}`;
  $('#more').innerHTML = '';
  const tm = $('#tblMore'); if (tm) tm.onclick = () => { limit = 1e6; renderTable(list); };
}
export function bindTable() {
  $('#tablewrap').addEventListener('click', e => {
    const th = e.target.closest('th[data-k]');
    if (th && th.dataset.k !== 'foto') { tableSort = { k: th.dataset.k, dir: tableSort && tableSort.k === th.dataset.k ? -tableSort.dir : 1 }; renderTable(FL.RESULT); return; }
    const f = e.target.closest('[data-fav]');
    if (f) { toggleSave(f.dataset.fav, f); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) openHouse(tr.dataset.id);
  });
}

// ------------------------------------------------------------ piede della ricerca
export function renderFoot() {
  const M = D.META;
  $('#foot').innerHTML = `<p>${nf.format(D.H.length)} case da ospitalitareligiosa.it e caseinautogestione.it, ricontrollate il ${fmtDate(M.date)}. Disponibilità e prezzi vanno sempre confermati con la casa. <a href="#/dati">Come leggere i dati</a></p>`;
}
