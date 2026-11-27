// Pagina "Confronta": fino a 6 case affiancate, con i valori migliori evidenziati.
import { $, $$, esc, icon, nf, fmtEuro, monthsTxt, download, csv, todayISO, toast } from './util.js';
import { D, ZONEL, priceInfo, pricePerPerson, FEAT_GROUPS, featLabel, STATO, MYSTATUSL, distFrom, ALLOGL, TRATTL, webLabel } from './data.js';
import * as store from './store.js';
import { F } from './filters.js';

let onlyDiff = false;

export function renderCompare() {
  const el = $('#view-compare');
  const ids = store.compare().filter(id => D.byId.has(id));
  const H = ids.map(id => D.byId.get(id));
  if (!H.length) {
    el.innerHTML = `<div class="page-in"><div class="page-head"><div><h1>Confronta</h1><p>Affianca fino a 6 case per vedere subito posti, prezzi, servizi e recapiti. Aggiungile con il pulsante ${icon('columns')} sulle foto o dalla scheda, oppure da una lista.</p></div></div>
      <div class="empty"><h3>Nessuna casa da confrontare</h3><p><a class="btn primary" href="#/">${icon('search')} Cerca le case</a></p>
      ${store.lists().filter(l => l.ids.length).map(l => `<button type="button" class="btn" data-fromlist="${l.id}" style="margin:4px">${icon('bookmark')} Usa “${esc(l.name)}”</button>`).join('')}</div></div>`;
    el.querySelectorAll('[data-fromlist]').forEach(b => b.onclick = () => { store.setCompare(store.getList(b.dataset.fromlist).ids); renderCompare(); });
    return;
  }
  const grp = F.grp, nights = F.notti;
  // righe: [etichetta, valore(h) -> html, chiave numerica per "migliore", direzione]
  const R = [];
  const add = (label, fn, num, dir) => R.push({ label, fn, num, dir });
  const grpRow = t => R.push({ group: t });
  grpRow('Essenziale');
  add('Posti letto', h => `<b class="num">${h.posti || '?'}</b>${h.posti_alt ? ` <span class="small">(${h.posti_alt} sull'altro portale)</span>` : ''}`, h => h.posti, 1);
  add('Minimo persone', h => h.min_p ? `${h.min_p}` : '<span class="no">nessuno indicato</span>');
  add('Prezzo', h => { const p = priceInfo(h, grp, nights); return p.ask ? '<span class="no">da chiedere</span>' : `<b>${esc(p.main)}</b> <span class="small">${esc(p.unit)}${p.sub ? ' · ' + esc(p.sub) : ''}</span>`; }, h => pricePerPerson(h, grp), -1);
  if (grp) add(`Stima per ${grp} persone${nights ? ' × ' + nights + ' notti' : ''}`, h => { const p = priceInfo(h, grp, nights); return p.est ? `€ ${nf.format(Math.round(p.est))}` : '<span class="no">–</span>'; }, h => priceInfo(h, grp, nights).est ?? null, -1);
  add('Minimo notti', h => h.min_n ? `${h.min_n}` : '<span class="no">nessuno indicato</span>');
  add('Aperta', h => esc(monthsTxt(h.mesi)) || '<span class="no">non indicato</span>');
  add('Dove', h => `${esc(h.comune)} (${esc(h.prov)})<br><span class="small">${esc(h.regione)}</span>`);
  if (F.origin) add(`Distanza da ${esc(F.origin.label)}`, h => { const d = distFrom(h, F.origin); return d != null ? `${nf.format(Math.round(d))} km` : '–'; }, h => distFrom(h, F.origin), -1);
  add('Zona e quota', h => `${esc(ZONEL[h.zona] || '')}${h.alt ? ' · ' + nf.format(h.alt) + ' m' : ''}`);
  add('Affidabilità', h => `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>`);
  grpRow('Contatti');
  add('Telefono', h => ((h.c || {}).tel || []).map(t => `<a href="tel:${esc(t.n.replace(/[^\d+]/g, ''))}">${esc(t.n)}</a> <span class="small">${t.k === 'cell' ? 'cell.' : 'fisso'}</span>`).join('<br>') || '<span class="no">–</span>');
  add('WhatsApp', h => ((h.c || {}).wa || []).map(w => esc(w)).join('<br>') || '<span class="no">–</span>');
  add('Email', h => ((h.c || {}).email || []).map(e => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || '<span class="no">–</span>');
  add('Sito', h => (h.c || {}).web ? `<a href="${esc(h.c.web)}" target="_blank" rel="noopener">${esc(webLabel(h.c.web)).slice(0, 34)}</a>` : '<span class="no">–</span>');
  grpRow('Spazi e servizi');
  const feats = FEAT_GROUPS.flatMap(g => g[1]).filter(k => H.some(h => h._f.has(k)));
  feats.forEach(k => add(featLabel(k), h => h._f.has(k) ? `<span class="yes">${icon('check')} sì</span>` : '<span class="no">–</span>', null, null, k));
  add('Alloggi', h => (h.allog || []).map(k => esc(ALLOGL[k] || k)).join(', ') || '<span class="no">–</span>');
  add('Trattamento', h => (h.tratt || []).map(k => esc(TRATTL[k] || k)).join(', ') || '<span class="no">–</span>');
  add('Camere / bagni', h => h.camere || h.bagni ? `${h.camere || '?'} / ${h.bagni || '?'}` : '<span class="no">–</span>');
  grpRow('Le mie note');
  add('Mio stato', h => esc(MYSTATUSL[store.note(h.id).status || ''] || '–'));
  add('Mio voto', h => store.note(h.id).rating ? '★'.repeat(store.note(h.id).rating) : '<span class="no">–</span>', h => store.note(h.id).rating || 0, 1);
  add('Preventivo', h => esc(store.note(h.id).quote || '') || '<span class="no">–</span>');
  add('Appunti', h => esc(store.note(h.id).note || '').replace(/\n/g, '<br>') || '<span class="no">–</span>');

  const best = r => {
    if (!r.num || H.length < 2) return null;
    const vals = H.map(h => r.num(h)).map(v => v == null || v === 0 && r.dir < 0 ? null : v);
    const ok = vals.filter(v => v != null); if (ok.length < 2) return null;
    const b = r.dir > 0 ? Math.max(...ok) : Math.min(...ok);
    if (ok.every(v => v === b)) return null;
    return vals.map(v => v === b);
  };
  const body = R.map(r => {
    if (r.group) return `<tr class="grp"><th scope="row" colspan="${H.length + 1}">${esc(r.group)}</th></tr>`;
    const cells = H.map(h => r.fn(h));
    if (onlyDiff && cells.every(c => c === cells[0])) return '';
    const b = best(r);
    return `<tr><th scope="row">${r.label}</th>${cells.map((c, i) => `<td class="${b && b[i] ? 'best' : ''} ${H.length > 1 && cells.every(x => x === c) ? 'same' : ''}">${c}</td>`).join('')}</tr>`;
  }).join('');
  el.innerHTML = `<div class="page-in">
    <div class="page-head"><div><h1>Confronta ${H.length} ${H.length === 1 ? 'casa' : 'case'}</h1><p>In verde il valore migliore di ogni riga.${grp ? '' : ' Indica il numero di persone nei filtri per vedere la stima di spesa.'}</p></div>
      <div class="acts"><label class="check"><input type="checkbox" id="onlyDiff" ${onlyDiff ? 'checked' : ''}> Solo le righe diverse</label>
      <button type="button" class="btn" id="cmpCsv">${icon('sheet')} CSV</button><button type="button" class="btn" id="cmpList">${icon('bookmark')} Salva come lista</button><button type="button" class="btn" id="cmpClear">${icon('trash')} Svuota</button></div></div>
    <div class="cmp-wrap"><table class="cmp"><thead><tr><th scope="col"><span class="vh">Caratteristica</span></th>${H.map(h => `<th scope="col">
      ${h.foto && h.foto[0] ? `<img src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<img alt="">'}
      <a class="hn" href="#/casa/${h.id}">${esc(h.nome)}</a><button type="button" class="link" data-rm="${h.id}">Togli</button></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
  $('#onlyDiff').onchange = e => { onlyDiff = e.target.checked; renderCompare(); };
  el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { store.toggleCompare(b.dataset.rm); renderCompare(); });
  $('#cmpClear').onclick = () => { const old = [...store.compare()]; store.setCompare([]); renderCompare(); toast('Confronto svuotato', { label: 'Annulla', run: () => { store.setCompare(old); renderCompare(); } }); };
  $('#cmpList').onclick = () => { const name = prompt('Nome della lista', 'Confronto ' + new Date().toLocaleDateString('it-IT')); if (!name) return; const l = store.createList(name); store.updateList(l.id, { ids: [...ids] }); toast(`Creata la lista "${l.name}"`); };
  $('#cmpCsv').onclick = () => {
    const strip = s => String(s).replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const rows = [['', ...H.map(h => h.nome)], ...R.filter(r => !r.group).map(r => [strip(r.label), ...H.map(h => strip(r.fn(h)))])];
    download(`casone-confronto-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  };
}
