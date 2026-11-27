// Pagina "Le mie liste": liste personali, stato dei contatti, note, esporta/importa, confronto tra liste.
import { $, $$, esc, icon, nf, fmtEuro, monthsTxt, download, readFile, toast, csv, todayISO, fmtDate, plural } from './util.js';
import { D, priceInfo, MYSTATUS, MYSTATUSL, STATO, webLabel } from './data.js';
import * as store from './store.js';
import { setFilters } from './filters.js';

let cur = 'fav', statusF = '', cmpA = null, cmpB = null;

export function renderLists() {
  const el = $('#view-lists');
  const L = store.lists();
  if (!store.getList(cur)) cur = 'fav';
  const l = store.getList(cur);
  const S = store.state();
  const allNotes = Object.keys(S.notes).length;
  const ids = l.ids.filter(id => D.byId.has(id));
  const pipe = MYSTATUS.map(([k, lab]) => [k, lab, ids.filter(id => (store.note(id).status || '') === k).length]);
  const shown = statusF === null || statusF === '' ? ids : ids.filter(id => (store.note(id).status || '') === statusF);
  el.innerHTML = `<div class="page-in">
    <div class="page-head"><div><h1>Le mie liste</h1><p>Salva le case in più liste, segna a che punto sei con i contatti e scrivi i tuoi appunti. Tutto resta in questo browser: esportalo in un file per passarlo a qualcuno, per usarlo su un altro dispositivo o per confrontare le scelte di più persone.</p></div>
      <div class="acts"><button type="button" class="btn" id="expBtn">${icon('download')} Esporta tutto</button><button type="button" class="btn" id="impBtn">${icon('upload')} Importa</button><input type="file" id="impFile" accept=".json,application/json" hidden></div></div>
    <div class="lists-layout">
      <nav class="listnav" aria-label="Liste">
        ${L.map(x => `<button type="button" class="li" data-l="${x.id}" aria-current="${x.id === cur}"><span class="sw" style="background:${esc(x.color)}"></span>${esc(x.name)}<span class="n">${x.ids.length}</span></button>`).join('')}
        <button type="button" class="btn quiet" id="newList">${icon('plus')} Nuova lista</button>
        <div style="margin-top:14px" class="small">${plural(allNotes, 'casa con note', 'case con note')} · ${plural(S.compare.length, 'casa', 'case')} nel confronto</div>
      </nav>
      <div>
        <div class="page-head" style="margin-bottom:12px"><div><h2 style="font-size:24px;font-weight:800;font-stretch:112%;display:flex;align-items:center;gap:10px"><span class="sw" style="width:14px;height:14px;border-radius:3px;background:${esc(l.color)}"></span>${esc(l.name)}</h2>
          <p class="small">${plural(ids.length, 'casa', 'case')}${l.imported ? ` · importata da ${esc(l.imported.from)} il ${fmtDate(l.imported.at.slice(0, 10))}` : ''}${ids.length ? ` · ${nf.format(ids.reduce((s, id) => s + (D.byId.get(id).posti || 0), 0))} posti in totale` : ''}</p></div>
          <div class="acts">
            <button type="button" class="btn small" id="onMap" ${ids.length ? '' : 'disabled'}>${icon('map')} Vedi sulla mappa</button>
            <button type="button" class="btn small" id="toCmp" ${ids.length ? '' : 'disabled'}>${icon('columns')} Confronta</button>
            <button type="button" class="btn small" id="csvL" ${ids.length ? '' : 'disabled'}>${icon('sheet')} CSV</button>
            <button type="button" class="btn small" id="shareL" ${ids.length ? '' : 'disabled'}>${icon('link')} Link</button>
            <button type="button" class="btn small" id="printL" ${ids.length ? '' : 'disabled'}>${icon('printer')} Stampa</button>
            ${l.fixed ? '' : `<button type="button" class="btn small" id="editL">${icon('pencil')} Rinomina</button><button type="button" class="btn small" id="delL">${icon('trash')} Elimina</button>`}
          </div></div>
        ${ids.length ? `<div class="pipeline">${[['', 'Tutte', ids.length], ...pipe.filter(p => p[0])].map(([k, lab, n]) => `<button type="button" data-st="${k}" aria-pressed="${(statusF || '') === k}"><b>${n}</b><span>${esc(lab)}</span></button>`).join('')}</div>` : ''}
        <div class="lrows">${shown.length ? shown.map(row).join('') : `<div class="empty"><h3>${ids.length ? 'Nessuna casa con questo stato' : 'Questa lista è vuota'}</h3><p>${ids.length ? '' : 'Nella ricerca, usa il segnalibro sulle foto per salvare le case nelle Preferite, oppure i pulsanti delle liste dentro ogni scheda.'}</p><p><a class="btn" href="#/">${icon('search')} Vai alla ricerca</a></p></div>`}</div>
        ${L.length > 1 ? overlapBlock(L) : ''}
      </div>
    </div></div>`;
  bind(l, ids);
}

function row(id) {
  const h = D.byId.get(id), n = store.note(id), p = priceInfo(h);
  const c = h.c || {};
  const wa = (c.wa || [])[0], em = (c.email || [])[0];
  const waD = wa ? wa.replace(/\D/g, '').slice(-9) : '';
  const tel = (c.tel || []).find(t => !waD || !t.n.replace(/\D/g, '').endsWith(waD));
  return `<article class="lrow" data-id="${id}">
    ${h.foto && h.foto[0] ? `<img class="th" src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="th"></span>'}
    <div><h3><a href="#/casa/${id}">${esc(h.nome)}</a></h3>
      <div class="place">${esc(h.comune)} (${esc(h.prov)}) · ${esc(h.regione)}</div>
      <div class="keyfacts"><span class="kf"><b>${h.posti || '?'}</b> posti</span>${p.ask ? '<span class="kf ask">prezzo da chiedere</span>' : `<span class="kf"><b style="font-size:16px">${esc(p.main)}</b> ${esc(p.unit)}</span>`}${h.stato !== 'ok' ? `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>` : ''}</div>
      <div class="contacts">${wa ? `<a class="wa" href="https://wa.me/${wa.replace(/\D/g, '').replace(/^(?!39)/, '39')}" target="_blank" rel="noopener">${icon('whatsapp')}${esc(wa)}</a>` : ''}${tel ? `<a href="tel:${esc(tel.n.replace(/[^\d+]/g, ''))}">${icon(tel.k === 'cell' ? 'smartphone' : 'phone')}${esc(tel.n)}</a>` : ''}${em ? `<a href="mailto:${esc(em)}">${icon('mail')}${esc(em)}</a>` : ''}${c.web ? `<a href="${esc(c.web)}" target="_blank" rel="noopener">${icon('globe')}${esc(webLabel(c.web)).slice(0, 28)}</a>` : ''}</div>
      <div class="acts"><button type="button" class="btn small quiet" data-move>${icon('list-plus')} Altre liste</button><button type="button" class="btn small quiet" data-rm>${icon('trash')} Togli</button></div>
    </div>
    <div class="mine">
      <select data-f="status" aria-label="Stato">${MYSTATUS.map(([k, l]) => `<option value="${k}" ${(n.status || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input type="text" data-f="quote" value="${esc(n.quote || '')}" placeholder="Preventivo / prezzo concordato" aria-label="Preventivo">
      <textarea data-f="note" placeholder="Appunti" aria-label="Appunti">${esc(n.note || '')}</textarea>
      <span class="small">${n.rating ? '★'.repeat(n.rating) + '☆'.repeat(5 - n.rating) : ''}</span>
    </div></article>`;
}

function overlapBlock(L) {
  const withIds = L.filter(l => l.ids.length);
  if (withIds.length < 2) return '';
  cmpA = cmpA && store.getList(cmpA) ? cmpA : withIds[0].id;
  cmpB = cmpB && store.getList(cmpB) && cmpB !== cmpA ? cmpB : (withIds.find(l => l.id !== cmpA) || withIds[1]).id;
  const A = store.getList(cmpA), B = store.getList(cmpB);
  const sa = new Set(A.ids), sb = new Set(B.ids);
  const both = A.ids.filter(x => sb.has(x)), onlyA = A.ids.filter(x => !sb.has(x)), onlyB = B.ids.filter(x => !sa.has(x));
  const li = arr => arr.filter(id => D.byId.has(id)).map(id => `<li><a href="#/casa/${id}">${esc(D.byId.get(id).nome)}</a> <span class="small">${esc(D.byId.get(id).comune)}</span></li>`).join('') || '<li class="small">nessuna</li>';
  const opts = sel => withIds.map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  return `<section class="sect"><h2>Confronta due liste <small>utile dopo aver importato le scelte di qualcun altro</small></h2>
    <div class="frow" style="margin-bottom:12px;flex-wrap:wrap"><select id="ovA">${opts(cmpA)}</select><span>con</span><select id="ovB">${opts(cmpB)}</select>
    <button type="button" class="btn small" id="ovMerge">${icon('merge')} Crea una lista con quelle in comune</button></div>
    <div class="overlap"><div><h4>In entrambe (${both.length})</h4><ul>${li(both)}</ul></div><div><h4>Solo in “${esc(A.name)}” (${onlyA.length})</h4><ul>${li(onlyA)}</ul></div><div><h4>Solo in “${esc(B.name)}” (${onlyB.length})</h4><ul>${li(onlyB)}</ul></div></div></section>`;
}

function bind(l, ids) {
  const el = $('#view-lists');
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { cur = b.dataset.l; statusF = ''; renderLists(); });
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { statusF = b.dataset.st; renderLists(); });
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
    catch (err) { toast(err.message || 'File non valido'); }
    e.target.value = '';
  };
  const om = $('#onMap'); if (om) om.onclick = () => { setFilters({ list: l.id, hideChiuse: false }); location.hash = '#/'; };
  const tc = $('#toCmp'); if (tc) tc.onclick = () => { store.setCompare(ids.slice(0, 6)); location.hash = '#/confronta'; if (ids.length > 6) toast('Nel confronto entrano le prime 6 case della lista'); };
  const cs = $('#csvL'); if (cs) cs.onclick = () => download(`casone-${slug(l.name)}-${todayISO()}.csv`, csvOf(ids), 'text/csv;charset=utf-8');
  const sh = $('#shareL'); if (sh) sh.onclick = async () => {
    const url = location.origin + location.pathname + '#/lista?n=' + encodeURIComponent(l.name) + '&ids=' + ids.join(',');
    try { await navigator.clipboard.writeText(url); toast('Link copiato: chi lo apre può importare la lista'); } catch (e) { prompt('Copia il link:', url); }
  };
  const pr = $('#printL'); if (pr) pr.onclick = () => window.print();
  el.querySelectorAll('.lrow').forEach(r => {
    const id = r.dataset.id;
    r.querySelectorAll('[data-f]').forEach(inp => {
      let t; const save = () => { store.setNote(id, { [inp.dataset.f]: inp.value }); if (inp.dataset.f === 'status') renderLists(); };
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(save, inp.tagName === 'SELECT' ? 0 : 350); });
    });
    r.querySelector('[data-rm]').onclick = () => { store.toggleList(l.id, id, false); renderLists(); toast('Tolta dalla lista', { label: 'Annulla', run: () => { store.toggleList(l.id, id, true); renderLists(); } }); };
    r.querySelector('[data-move]').onclick = () => moveModal(id);
  });
  const a = $('#ovA'), b = $('#ovB');
  if (a) { a.onchange = () => { cmpA = a.value; renderLists(); }; b.onchange = () => { cmpB = b.value; renderLists(); }; }
  const mg = $('#ovMerge'); if (mg) mg.onclick = () => {
    const A = store.getList(cmpA), B = store.getList(cmpB), sb = new Set(B.ids);
    const nl = store.createList(`In comune: ${A.name} + ${B.name}`); nl.ids = A.ids.filter(x => sb.has(x)); store.updateList(nl.id, {}); cur = nl.id; renderLists();
  };
}
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lista';

export function csvOf(ids) {
  const rows = [['Nome', 'Comune', 'Provincia', 'Regione', 'Posti', 'Min. persone', 'Prezzo', 'Unità', 'Aperta', 'Cellulare', 'Fisso', 'WhatsApp', 'Email', 'Sito', 'Affidabilità', 'Mio stato', 'Voto', 'Preventivo', 'Appunti', 'Liste', 'Scheda Casone', 'Annunci']];
  for (const id of ids) {
    const h = D.byId.get(id); if (!h) continue;
    const n = store.note(id), c = h.c || {}, tel = c.tel || [];
    rows.push([h.nome, h.comune, h.prov, h.regione, h.posti, h.min_p || '', h.prezzo ? h.prezzo.v : (h.libera ? 'offerta libera' : ''), h.prezzo ? (h.prezzo.u === 'casa' ? 'casa/notte' : 'persona/notte') : '',
      monthsTxt(h.mesi), tel.filter(t => t.k === 'cell').map(t => t.n).join(' / '), tel.filter(t => t.k !== 'cell').map(t => t.n).join(' / '), (c.wa || []).join(' / '), (c.email || []).join(' / '), c.web || '',
      STATO[h.stato].short, MYSTATUSL[n.status || ''] || '', n.rating || '', n.quote || '', n.note || '', store.listsOf(id).map(l => l.name).join(', '),
      location.origin + location.pathname + '#/casa/' + id, '']);
  }
  return csv(rows);
}

// ------------------------------------------------------------ finestre
function listModal(l) {
  const m = $('#modal');
  m.innerHTML = `<form method="dialog"><div class="m-head"><h2>${l ? 'Rinomina la lista' : 'Nuova lista'}</h2></div><div class="m-body">
    <label class="small">Nome<input type="text" id="lname" value="${esc(l ? l.name : '')}" placeholder="es. Campo estivo 2027" required></label>
    <div class="swatches">${store.COLORS.map((c, i) => `<label style="background:${c}"><input type="radio" name="lc" value="${c}" ${(l ? l.color === c : i === store.lists().length % store.COLORS.length) ? 'checked' : ''}><span class="vh">colore ${i + 1}</span></label>`).join('')}</div>
    </div><div class="m-foot"><button type="button" class="btn" value="cancel" data-x>Annulla</button><button class="btn primary" value="ok">${l ? 'Salva' : 'Crea la lista'}</button></div></form>`;
  m.querySelector('[data-x]').onclick = () => m.close();
  m.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const name = $('#lname').value.trim(); if (!name) return;
    const color = m.querySelector('input[name=lc]:checked')?.value;
    if (l) store.updateList(l.id, { name, color }); else cur = store.createList(name, color).id;
    m.close(); renderLists();
  };
  m.showModal(); setTimeout(() => $('#lname').focus(), 30);
}
function moveModal(id) {
  const m = $('#modal'), h = D.byId.get(id);
  const draw = () => {
    m.innerHTML = `<div class="m-head"><h2>Liste di “${esc(h.nome)}”</h2><button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
    <div class="m-body"><div class="checks">${store.lists().map(l => `<label class="check"><input type="checkbox" data-l="${l.id}" ${l.ids.includes(id) ? 'checked' : ''}><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${esc(l.color)}"></span>${esc(l.name)}<small>${l.ids.length}</small></label>`).join('')}</div></div>
    <div class="m-foot"><button type="button" class="btn primary" data-x>Fatto</button></div>`;
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { m.close(); renderLists(); });
    m.querySelectorAll('[data-l]').forEach(c => c.onchange = () => store.toggleList(c.dataset.l, id, c.checked));
  };
  draw(); m.showModal();
}
function exportModal() {
  const m = $('#modal'), S = store.state();
  m.innerHTML = `<div class="m-head"><h2>Esporta i tuoi dati</h2><button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
    <div class="m-body"><p style="margin:0">Il file contiene ${plural(S.lists.length, 'lista', 'liste')}, le note di ${plural(Object.keys(S.notes).length, 'casa', 'case')}, il confronto e le ricerche salvate. Si reimporta da questa pagina, anche su un altro dispositivo o da un'altra persona.</p>
    <label class="small">Il tuo nome (così chi lo importa sa di chi sono le scelte)<input type="text" id="author" value="${esc(S.prefs.author || '')}" placeholder="es. Marta"></label></div>
    <div class="m-foot"><button type="button" class="btn" data-csv>${icon('sheet')} Tutte le case salvate in CSV</button><button type="button" class="btn primary" data-json>${icon('file-json')} Scarica il file</button></div>`;
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
    <label class="opt"><input type="radio" name="mode" value="replace"><span><b>Sostituisci tutto</b><span>Cancella le tue liste e note in questo browser e mette quelle del file (utile per spostarti su un altro dispositivo).</span></span></label>
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
export function setCurrent(id) { cur = id; }
