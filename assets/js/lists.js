// Pagina "Le mie case": liste personali, avanzamento dei contatti (per stato), confronto, esporta/importa.
import { $, $$, esc, icon, nf, download, readFile, toast, csv, todayISO, fmtDate, plural, monthsTxt } from './util.js';
import { D, priceInfo, MYSTATUS, MYSTATUSL, STATO, webLabel, webUsable, phoneHref, waHref } from './data.js';
import * as store from './store.js';
import { setFilters } from './filters.js';
import { askModal } from './detail.js';
import { compareTable } from './compare.js';

let cur = 'fav', view = 'avanzamento', cmpA = null, cmpB = null;
export function setView(v) { view = v; }
export function setCurrent(id) { cur = id; }

// le fasi del lavoro, dagli stati che ognuno segna sulla casa
const STAGES = [
  ['todo', 'Da contattare', ['', 'da_contattare']],
  ['wait', 'Aspettiamo risposta', ['contattata', 'in_attesa']],
  ['ok', 'Hanno risposto', ['disponibile', 'preventivo']],
  ['done', 'Prenotata', ['confermata']],
  ['no', 'Scartate', ['scartata']],
];
const stageOf = id => (STAGES.find(s => s[2].includes(store.note(id).status || '')) || STAGES[0])[0];

export function renderLists() {
  const el = $('#view-lists');
  const L = store.lists();
  if (!store.getList(cur)) cur = 'fav';
  const l = store.getList(cur);
  const ids = l.ids.filter(id => D.byId.has(id));
  const by = Object.fromEntries(STAGES.map(s => [s[0], ids.filter(id => stageOf(id) === s[0])]));
  const posti = ids.reduce((s, id) => s + (D.byId.get(id).posti || 0), 0);
  el.innerHTML = `<div class="page-in">
    <div class="page-head"><div><h1>Le mie case</h1><p>Le case che salvi, divise in liste. Segna a che punto sei con ognuna: qui le trovi in ordine, da contattare, in attesa, con una risposta.</p></div>
      <div class="acts"><button type="button" class="btn" id="expBtn">${icon('download')} Esporta</button><button type="button" class="btn" id="impBtn">${icon('upload')} Importa</button><input type="file" id="impFile" accept=".json,application/json" hidden></div></div>
    <div class="lists-layout">
      <nav class="listnav" aria-label="Liste">
        ${L.map(x => `<button type="button" class="li" data-l="${x.id}" aria-current="${x.id === cur}"><span class="sw" style="background:${esc(x.color)}"></span><span class="ln">${esc(x.name)}</span><span class="n">${x.ids.length}</span></button>`).join('')}
        <button type="button" class="btn quiet" id="newList">${icon('plus')} Nuova lista</button>
        <p class="small navnote">Liste e appunti restano in questo browser. Con Esporta li passi a un'altra persona o a un altro dispositivo.</p>
      </nav>
      <div class="lmainwrap">
        <div class="lhead">
          <h2><span class="sw" style="background:${esc(l.color)}"></span>${esc(l.name)}</h2>
          <p class="small">${plural(ids.length, 'casa', 'case')}${ids.length ? `, ${nf.format(posti)} posti in tutto` : ''}${l.imported ? `. Importata da ${esc(l.imported.from)} il ${fmtDate(l.imported.at.slice(0, 10))}` : ''}</p>
          <div class="acts">
            <button type="button" class="btn small" id="onMap" title="Sulla mappa" ${ids.length ? '' : 'disabled'}>${icon('map')}<span>Sulla mappa</span></button>
            <button type="button" class="btn small" id="shareL" title="Copia il link della lista" ${ids.length ? '' : 'disabled'}>${icon('link')}<span>Link</span></button>
            <button type="button" class="btn small" id="csvL" title="Scarica in CSV" ${ids.length ? '' : 'disabled'}>${icon('sheet')}<span>CSV</span></button>
            <button type="button" class="btn small" id="printL" title="Stampa" ${ids.length ? '' : 'disabled'}>${icon('printer')}<span>Stampa</span></button>
            ${l.fixed ? '' : `<button type="button" class="btn small" id="editL" title="Rinomina">${icon('pencil')}<span>Rinomina</span></button><button type="button" class="btn small" id="delL" title="Elimina la lista">${icon('trash')}<span>Elimina</span></button>`}
          </div>
        </div>
        ${ids.length ? `<div class="progress" aria-label="A che punto siete">${STAGES.filter(s => s[0] !== 'no').map(([k, lab]) => `<div class="pg pg-${k}" style="flex:${by[k].length || .0001}"><b>${by[k].length}</b> ${esc(lab.toLowerCase())}</div>`).join('')}</div>
          <div class="tabs" role="tablist">
            <button type="button" role="tab" data-v="avanzamento" aria-selected="${view === 'avanzamento'}">${icon('list-plus')} Contatti</button>
            <button type="button" role="tab" data-v="confronto" aria-selected="${view === 'confronto'}">${icon('columns')} Confronta</button>
          </div>` : ''}
        <div id="lbody">${!ids.length ? emptyList() : view === 'confronto' ? '' : stagesHtml(by)}</div>
        ${L.filter(x => x.ids.length).length > 1 ? overlapBlock(L) : ''}
      </div>
    </div></div>`;
  if (ids.length && view === 'confronto') {
    const live = ids.filter(id => stageOf(id) !== 'no');
    compareTable($('#lbody'), live.length ? live : ids, { title: l.name, onChange: renderLists });
  }
  bind(l, ids);
}

function emptyList() {
  return `<div class="empty"><h3>Questa lista è vuota</h3><p>Nella ricerca, tocca il segnalibro su una casa per salvarla nelle Preferite. Dalla scheda di una casa puoi metterla anche in altre liste.</p><p><a class="btn primary" href="#/">${icon('search')} Cerca le case</a></p></div>`;
}
function stagesHtml(by) {
  return STAGES.map(([k, lab]) => {
    const arr = by[k]; if (!arr.length) return '';
    const body = `<div class="lrows">${arr.map(id => row(id, k)).join('')}</div>`;
    if (k === 'no') return `<details class="stage st-no"><summary><h3>${esc(lab)} <span>${arr.length}</span></h3></summary>${body}</details>`;
    return `<section class="stage st-${k}"><h3>${esc(lab)} <span>${arr.length}</span></h3>${body}</section>`;
  }).join('');
}

function row(id, stage) {
  const h = D.byId.get(id), n = store.note(id), p = priceInfo(h);
  const c = h.c || {};
  const wa = (c.wa || [])[0];
  const waD = wa ? wa.replace(/\D/g, '').slice(-9) : '';
  const tels = (c.tel || []).filter(t => !waD || !t.n.replace(/\D/g, '').endsWith(waD)).slice(0, 2);
  const em = (c.email || [])[0];
  const links = [
    wa ? `<a class="wa" href="${esc(waHref(wa))}" target="_blank" rel="noopener">${icon('whatsapp')}${esc(wa)}</a>` : '',
    ...tels.map(t => `<a href="${esc(phoneHref(t.n))}">${icon(t.k === 'cell' ? 'smartphone' : 'phone')}${esc(t.n)}</a>`),
    em ? `<a href="mailto:${esc(em)}">${icon('mail')}${esc(em)}</a>` : '',
    webUsable(c) ? `<a href="${esc(c.web)}" target="_blank" rel="noopener">${icon('globe')}${esc(webLabel(c.web)).slice(0, 30)}</a>` : '',
  ].filter(Boolean);
  const stars = [1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" class="${(n.rating || 0) >= i ? 'on' : ''}" aria-label="${i} su 5">${icon('star')}</button>`).join('');
  return `<article class="lrow" data-id="${id}">
    ${h.foto && h.foto[0] ? `<img class="th" src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="th"></span>'}
    <div class="lm">
      <h4><a href="#/casa/${id}">${esc(h.nome)}</a></h4>
      <p class="place">${esc(h.comune)} (${esc(h.prov)}), ${esc(h.regione)}</p>
      <p class="keys"><span class="po"><b>${h.posti || '?'}</b> posti</span>${p.ask ? '<span class="pr ask">prezzo da chiedere</span>' : `<span class="pr"><b>${esc(p.main)}</b> ${esc(p.unit)}</span>`}${h.stato === 'dubbia' || h.stato === 'chiusa' ? `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>` : ''}</p>
      ${links.length ? `<div class="reach">${links.join('')}</div>` : `<p class="reach none">${icon('message')}${(h.src || []).includes('CIA') && !c.form ? 'Si contatta dal portale caseinautogestione.it' : 'Si contatta dal modulo del portale'}</p>`}
      <div class="racts">${stage === 'todo' ? `<button type="button" class="btn small primary" data-ask>${icon('send')} Prepara la richiesta</button>` : ''}<button type="button" class="btn small quiet" data-move>${icon('bookmark')} Liste</button><button type="button" class="btn small quiet" data-rm>${icon('trash')} Togli</button></div>
    </div>
    <div class="mine">
      <select data-f="status" aria-label="A che punto sei">${MYSTATUS.map(([k, l]) => `<option value="${k}" ${(n.status || '') === k ? 'selected' : ''}>${k ? l : 'Stato: da contattare'}</option>`).join('')}</select>
      <span class="stars" aria-label="Il mio voto">${stars}</span>
      <input type="text" data-f="quote" value="${esc(n.quote || '')}" placeholder="Preventivo o prezzo concordato" aria-label="Preventivo">
      <textarea data-f="note" placeholder="Appunti (es. richiamare lunedì)" aria-label="Appunti" rows="2">${esc(n.note || '')}</textarea>
    </div></article>`;
}

function overlapBlock(L) {
  const withIds = L.filter(l => l.ids.length);
  cmpA = cmpA && store.getList(cmpA) ? cmpA : withIds[0].id;
  cmpB = cmpB && store.getList(cmpB) && cmpB !== cmpA ? cmpB : (withIds.find(l => l.id !== cmpA) || withIds[1]).id;
  const A = store.getList(cmpA), B = store.getList(cmpB);
  const sa = new Set(A.ids), sb = new Set(B.ids);
  const both = A.ids.filter(x => sb.has(x)), onlyA = A.ids.filter(x => !sb.has(x)), onlyB = B.ids.filter(x => !sa.has(x));
  const li = arr => arr.filter(id => D.byId.has(id)).map(id => `<li><a href="#/casa/${id}">${esc(D.byId.get(id).nome)}</a> <span class="small">${esc(D.byId.get(id).comune)}</span></li>`).join('') || '<li class="small">nessuna</li>';
  const opts = sel => withIds.map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  return `<details class="sect overlapbox" ${cmpOpen ? 'open' : ''}><summary><h2>Confronta due liste <small>per vedere su quali case siete d'accordo, dopo aver importato le scelte di qualcun altro</small></h2></summary>
    <div class="frow" style="margin:12px 0;flex-wrap:wrap"><select id="ovA">${opts(cmpA)}</select><span>con</span><select id="ovB">${opts(cmpB)}</select>
    <button type="button" class="btn small" id="ovMerge">${icon('merge')} Crea una lista con quelle in comune</button></div>
    <div class="overlap"><div><h4>In entrambe (${both.length})</h4><ul>${li(both)}</ul></div><div><h4>Solo in “${esc(A.name)}” (${onlyA.length})</h4><ul>${li(onlyA)}</ul></div><div><h4>Solo in “${esc(B.name)}” (${onlyB.length})</h4><ul>${li(onlyB)}</ul></div></div></details>`;
}
let cmpOpen = false;

function bind(l, ids) {
  const el = $('#view-lists');
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { cur = b.dataset.l; renderLists(); });
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { view = b.dataset.v; renderLists(); });
  $('#newList').onclick = () => listModal();
  const ed = $('#editL'); if (ed) ed.onclick = () => listModal(l);
  const del = $('#delL'); if (del) del.onclick = () => {
    const old = store.deleteList(l.id); cur = 'fav'; renderLists();
    toast(`Lista "${old.name}" eliminata`, { label: 'Annulla', run: () => { store.restoreList(old); cur = old.id; renderLists(); } });
  };
  $('#expBtn').onclick = () => exportModal();
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const obj = store.validateImport(JSON.parse(await readFile(f))); importModal(obj, f.name); }
    catch (err) { toast(err.message || 'Il file non è valido'); }
    e.target.value = '';
  };
  const om = $('#onMap'); if (om) om.onclick = () => { setFilters({ list: l.id, hideChiuse: false }); location.hash = '#/'; };
  const cs = $('#csvL'); if (cs) cs.onclick = () => download(`casone-${slug(l.name)}-${todayISO()}.csv`, csvOf(ids), 'text/csv;charset=utf-8');
  const sh = $('#shareL'); if (sh) sh.onclick = async () => {
    const url = location.origin + location.pathname + '#/lista?n=' + encodeURIComponent(l.name) + '&ids=' + ids.join(',');
    try { await navigator.clipboard.writeText(url); toast('Link copiato: chi lo apre può importare la lista'); } catch (e) { prompt('Copia il link:', url); }
  };
  const pr = $('#printL'); if (pr) pr.onclick = () => window.print();
  el.querySelectorAll('.lrow').forEach(r => {
    const id = r.dataset.id;
    r.querySelectorAll('[data-f]').forEach(inp => {
      let t; const save = () => { store.setNote(id, { [inp.dataset.f]: inp.value }); if (inp.dataset.f === 'status') { renderLists(); toast('Stato aggiornato: ' + (MYSTATUSL[inp.value] || 'da contattare').toLowerCase()); } };
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(save, inp.tagName === 'SELECT' ? 0 : 350); });
    });
    r.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
      const curR = store.note(id).rating || 0, v = +b.dataset.star === curR ? 0 : +b.dataset.star;
      store.setNote(id, { rating: v }); r.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= v));
    });
    const ask = r.querySelector('[data-ask]'); if (ask) ask.onclick = () => askModal(D.byId.get(id), () => renderLists());
    r.querySelector('[data-rm]').onclick = () => { store.toggleList(l.id, id, false); renderLists(); toast('Tolta dalla lista', { label: 'Annulla', run: () => { store.toggleList(l.id, id, true); renderLists(); } }); };
    r.querySelector('[data-move]').onclick = () => listsModal(id, renderLists);
  });
  const ob = el.querySelector('.overlapbox'); if (ob) ob.ontoggle = () => { cmpOpen = ob.open; };
  const a = $('#ovA'), b = $('#ovB');
  if (a) { a.onchange = () => { cmpA = a.value; renderLists(); }; b.onchange = () => { cmpB = b.value; renderLists(); }; }
  const mg = $('#ovMerge'); if (mg) mg.onclick = () => {
    const A = store.getList(cmpA), B = store.getList(cmpB), sb = new Set(B.ids);
    const nl = store.createList(`In comune: ${A.name} + ${B.name}`); store.updateList(nl.id, { ids: A.ids.filter(x => sb.has(x)) }); cur = nl.id; renderLists();
  };
}
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lista';

export function csvOf(ids) {
  const rows = [['Nome', 'Comune', 'Provincia', 'Regione', 'Posti', 'Min. persone', 'Prezzo', 'Unità', 'Aperta', 'Cellulare', 'Fisso', 'WhatsApp', 'Email', 'Sito', 'Affidabilità', 'Mio stato', 'Voto', 'Preventivo', 'Appunti', 'Liste', 'Scheda Casone']];
  for (const id of ids) {
    const h = D.byId.get(id); if (!h) continue;
    const n = store.note(id), c = h.c || {}, tel = c.tel || [];
    rows.push([h.nome, h.comune, h.prov, h.regione, h.posti, h.min_p || '', h.prezzo ? h.prezzo.v : (h.libera ? 'offerta libera' : ''), h.prezzo ? (h.prezzo.u === 'casa' ? 'casa/notte' : 'persona/notte') : '',
      monthsTxt(h.mesi), tel.filter(t => t.k === 'cell').map(t => t.n).join(' / '), tel.filter(t => t.k !== 'cell').map(t => t.n).join(' / '), (c.wa || []).join(' / '), (c.email || []).join(' / '), c.web || '',
      STATO[h.stato].short, MYSTATUSL[n.status || ''] || '', n.rating || '', n.quote || '', n.note || '', store.listsOf(id).map(l => l.name).join(', '),
      location.origin + location.pathname + '#/casa/' + id]);
  }
  return csv(rows);
}

// ------------------------------------------------------------ finestre
function listModal(l, after) {
  const m = $('#modal');
  m.innerHTML = `<form method="dialog"><div class="m-head"><h2>${l ? 'Rinomina la lista' : 'Nuova lista'}</h2></div><div class="m-body">
    <label class="small">Nome<input type="text" id="lname" value="${esc(l ? l.name : '')}" placeholder="es. Campo estivo 2027" required></label>
    <div class="swatches">${store.COLORS.map((c, i) => `<label style="background:${c}"><input type="radio" name="lc" value="${c}" ${(l ? l.color === c : i === store.lists().length % store.COLORS.length) ? 'checked' : ''}><span class="vh">colore ${i + 1}</span></label>`).join('')}</div>
    </div><div class="m-foot"><button type="button" class="btn" value="cancel" data-x>Annulla</button><button class="btn primary" value="ok">${l ? 'Salva' : 'Crea la lista'}</button></div></form>`;
  // dentro la scelta delle liste (after) la finestra resta aperta e torna all'elenco
  m.querySelector('[data-x]').onclick = () => { if (after) after(null); else m.close(); };
  m.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const name = $('#lname').value.trim(); if (!name) return;
    const color = m.querySelector('input[name=lc]:checked')?.value;
    let nl = null;
    if (l) store.updateList(l.id, { name, color }); else { nl = store.createList(name, color); if (!after) cur = nl.id; }
    if (after) { after(nl); return; }
    m.close(); renderLists();
  };
  if (!m.open) m.showModal(); setTimeout(() => $('#lname').focus(), 30);
}
// scelta delle liste per una casa (dalla ricerca, dalla scheda, da qui)
export function listsModal(id, done) {
  const m = $('#modal'), h = D.byId.get(id);
  const draw = () => {
    m.innerHTML = `<div class="m-head"><h2>Salva “${esc(h.nome)}”</h2><button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
    <div class="m-body"><div class="checks">${store.lists().map(l => `<label class="check"><input type="checkbox" data-lst="${l.id}" ${l.ids.includes(id) ? 'checked' : ''}><span class="sw" style="background:${esc(l.color)}"></span><span>${esc(l.name)}</span><small>${l.ids.length}</small></label>`).join('')}</div>
    <button type="button" class="btn quiet" data-new style="align-self:flex-start">${icon('plus')} Nuova lista</button></div>
    <div class="m-foot"><button type="button" class="btn primary" data-x>Fatto</button></div>`;
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.close());
    m.querySelectorAll('[data-lst]').forEach(c => c.onchange = () => store.toggleList(c.dataset.lst, id, c.checked));
    m.querySelector('[data-new]').onclick = () => listModal(null, nl => { if (nl) store.toggleList(nl.id, id, true); draw(); });
  };
  m.onclose = () => { m.onclose = null; if (done) done(); };
  draw(); if (!m.open) m.showModal();
}
function exportModal() {
  const m = $('#modal'), S = store.state();
  m.innerHTML = `<div class="m-head"><h2>Esporta le tue case</h2><button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
    <div class="m-body"><p style="margin:0">Il file contiene ${plural(S.lists.length, 'lista', 'liste')}, gli appunti su ${plural(Object.keys(S.notes).length, 'casa', 'case')} e le ricerche salvate. Si apre da questa pagina con Importa, anche su un altro dispositivo o da un'altra persona.</p>
    <label class="small">Il tuo nome, così chi lo importa sa di chi sono le scelte<input type="text" id="author" value="${esc(S.prefs.author || '')}" placeholder="es. Marta"></label></div>
    <div class="m-foot"><button type="button" class="btn" data-csv>${icon('sheet')} Tabella CSV delle case salvate</button><button type="button" class="btn primary" data-json>${icon('file-json')} Scarica il file</button></div>`;
  m.querySelector('[data-x]').onclick = () => m.close();
  m.querySelector('[data-json]').onclick = () => {
    const a = $('#author').value.trim(); store.setPref('author', a);
    download(`casone-${slug(a || 'dati')}-${todayISO()}.json`, JSON.stringify(store.exportData(a), null, 1));
    m.close(); toast('File scaricato');
  };
  m.querySelector('[data-csv]').onclick = () => { const ids = [...store.savedIds()]; download(`casone-case-salvate-${todayISO()}.csv`, csvOf(ids), 'text/csv;charset=utf-8'); };
  m.showModal();
}
export function importModal(obj, fname, preset) {
  const m = $('#modal');
  const nL = obj.lists.length, nH = new Set(obj.lists.flatMap(l => l.ids || [])).size, nN = Object.keys(obj.notes || {}).length;
  const who = obj.author || (fname || '').replace(/\.json$/, '');
  m.innerHTML = `<form method="dialog"><div class="m-head"><h2>Importa ${obj.author ? 'le scelte di ' + esc(obj.author) : 'un file'}</h2></div><div class="m-body">
    <p style="margin:0">${plural(nL, 'lista', 'liste')} con ${plural(nH, 'casa', 'case')} e ${plural(nN, 'nota', 'note')}${obj.exported ? `, esportato il ${fmtDate(obj.exported.slice(0, 10))}` : ''}.</p>
    <label class="opt"><input type="radio" name="mode" value="separate" ${preset !== 'merge' ? 'checked' : ''}><span><b>Aggiungi come liste separate</b><span>Le sue liste compaiono accanto alle tue con il suo nome, per confrontarle. Le sue note si aggiungono alle tue.</span></span></label>
    <label class="opt"><input type="radio" name="mode" value="merge" ${preset === 'merge' ? 'checked' : ''}><span><b>Unisci alle mie</b><span>Le case finiscono nelle liste con lo stesso nome; le note si sommano.</span></span></label>
    <label class="opt"><input type="radio" name="mode" value="replace"><span><b>Sostituisci tutto</b><span>Cancella le tue liste e note in questo browser e mette quelle del file (per spostarti su un altro dispositivo).</span></span></label>
    <label class="small">Nome da usare per le liste separate<input type="text" id="impTag" value="${esc(who)}"></label>
    </div><div class="m-foot"><button type="button" class="btn" data-x>Annulla</button><button class="btn primary">Importa</button></div></form>`;
  m.querySelector('[data-x]').onclick = () => m.close();
  m.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const mode = m.querySelector('input[name=mode]:checked').value;
    if (mode === 'replace' && !confirm('Sostituire liste e note di questo browser con quelle del file?')) return;
    store.importData(obj, mode, $('#impTag').value);
    m.close(); renderLists(); toast('Importazione completata');
  };
  m.showModal();
}
