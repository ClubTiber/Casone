// Confronto affiancato delle case di una lista, con il valore migliore di ogni riga evidenziato.
// Si usa dentro "Le mie case" (scheda Confronta).
import { esc, icon, nf, monthsTxt, download, csv, todayISO, toast } from './util.js';
import { D, ZONEL, priceInfo, pricePerPerson, FEAT_GROUPS, featLabel, STATO, MYSTATUSL, distFrom, ALLOGL, TRATTL, webLabel, webUsable } from './data.js';
import * as store from './store.js';
import { F, stayNights } from './filters.js';

const MAX = 12;
let onlyDiff = true;

export function compareTable(el, allIds, opts = {}) {
  const ids = allIds.filter(id => D.byId.has(id)).slice(0, MAX);
  const H = ids.map(id => D.byId.get(id));
  const grp = F.grp, nights = stayNights();
  // righe: [etichetta, valore(h) -> html, chiave numerica per "migliore", direzione]
  const R = [];
  const add = (label, fn, num, dir) => R.push({ label, fn, num, dir });
  const grpRow = t => R.push({ group: t });
  grpRow('Essenziale');
  add('Posti letto', h => `<b class="num">${h.posti || '?'}</b>${h.posti_alt ? ` <span class="small">(${h.posti_alt} sull'altro portale)</span>` : ''}`, h => h.posti, 1);
  add('Minimo persone', h => h.min_p ? `${h.min_p}` : '<span class="no">nessuno indicato</span>');
  add('Prezzo', h => { const p = priceInfo(h, grp, nights); return p.ask ? '<span class="no">da chiedere</span>' : `<b>${esc(p.main)}</b> <span class="small">${esc(p.unit)}${p.sub ? ', ' + esc(p.sub) : ''}</span>`; }, h => pricePerPerson(h, grp), -1);
  if (grp) add(`Spesa stimata per ${grp} persone${nights ? ' e ' + nights + ' notti' : ''}`, h => { const p = priceInfo(h, grp, nights); return p.est ? `€ ${nf.format(Math.round(p.est))}` : '<span class="no">–</span>'; }, h => priceInfo(h, grp, nights).est ?? null, -1);
  add('Preventivo ricevuto', h => esc(store.note(h.id).quote || '') || '<span class="no">–</span>');
  add('Minimo notti', h => h.min_n ? `${h.min_n}` : '<span class="no">nessuno indicato</span>');
  add('Aperta', h => esc(monthsTxt(h.mesi)) || '<span class="no">non indicato</span>');
  add('Dove', h => `${esc(h.comune)} (${esc(h.prov)})<br><span class="small">${esc(h.regione)}</span>`);
  if (F.origin) add(`Distanza da ${esc(F.origin.label)}`, h => { const d = distFrom(h, F.origin); return d != null ? `${nf.format(Math.round(d))} km` : '–'; }, h => distFrom(h, F.origin), -1);
  add('Zona e quota', h => `${esc(ZONEL[h.zona] || '')}${h.alt ? ', ' + nf.format(h.alt) + ' m' : ''}`);
  add('Affidabilità', h => `<span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span>`);
  grpRow('Le nostre valutazioni');
  add('Stato', h => esc(MYSTATUSL[store.note(h.id).status || ''] || 'Da contattare'));
  add('Voto', h => store.note(h.id).rating ? '★'.repeat(store.note(h.id).rating) : '<span class="no">–</span>', h => store.note(h.id).rating || 0, 1);
  add('Appunti', h => esc(store.note(h.id).note || '').replace(/\n/g, '<br>') || '<span class="no">–</span>');
  grpRow('Spazi e servizi');
  const feats = FEAT_GROUPS.flatMap(g => g[1]).filter(k => H.some(h => h._f.has(k)));
  feats.forEach(k => add(featLabel(k), h => h._f.has(k) ? `<span class="yes">${icon('check')} sì</span>` : '<span class="no">–</span>'));
  add('Alloggi', h => (h.allog || []).map(k => esc(ALLOGL[k] || k)).join(', ') || '<span class="no">–</span>');
  add('Trattamento', h => (h.tratt || []).map(k => esc(TRATTL[k] || k)).join(', ') || '<span class="no">–</span>');
  add('Camere / bagni', h => h.camere || h.bagni ? `${h.camere || '?'} / ${h.bagni || '?'}` : '<span class="no">–</span>');
  grpRow('Contatti');
  add('Telefono', h => ((h.c || {}).tel || []).map(t => `<a href="tel:${esc(t.n.replace(/[^\d+]/g, ''))}">${esc(t.n)}</a> <span class="small">${t.k === 'cell' ? 'cell.' : 'fisso'}</span>`).join('<br>') || '<span class="no">–</span>');
  add('WhatsApp', h => ((h.c || {}).wa || []).map(w => esc(w)).join('<br>') || '<span class="no">–</span>');
  add('Email', h => ((h.c || {}).email || []).map(e => `<a href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || '<span class="no">–</span>');
  add('Sito', h => webUsable(h.c) ? `<a href="${esc(h.c.web)}" target="_blank" rel="noopener">${esc(webLabel(h.c.web)).slice(0, 34)}</a>` : '<span class="no">–</span>');

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
    const same = H.length > 1 && cells.every(c => c === cells[0]);
    if (onlyDiff && same) return '';
    const b = best(r);
    return `<tr><th scope="row">${r.label}</th>${cells.map((c, i) => `<td class="${b && b[i] ? 'best' : ''} ${same ? 'same' : ''}">${c}</td>`).join('')}</tr>`;
  }).join('');
  el.innerHTML = `<div class="cmp-head">
      <p class="small">${H.length} ${H.length === 1 ? 'casa' : 'case'}${allIds.length > MAX ? ` (le prime ${MAX})` : ''}, senza le scartate. In verde il valore migliore di ogni riga.${grp ? '' : ' Dite quanti siete nella ricerca per vedere la spesa stimata.'}</p>
      <label class="check"><input type="checkbox" id="onlyDiff" ${onlyDiff ? 'checked' : ''}> Solo quello che cambia</label>
      <button type="button" class="btn small" id="cmpCsv">${icon('sheet')} CSV</button></div>
    <div class="cmp-wrap"><table class="cmp"><thead><tr><th scope="col"><span class="vh">Caratteristica</span></th>${H.map(h => `<th scope="col">
      ${h.foto && h.foto[0] ? `<img src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="noimg"></span>'}
      <a class="hn" href="#/casa/${h.id}">${esc(h.nome)}</a><button type="button" class="link" data-drop="${h.id}">Scarta</button></th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  el.querySelector('#onlyDiff').onchange = e => { onlyDiff = e.target.checked; compareTable(el, allIds, opts); };
  el.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
    const id = b.dataset.drop, old = store.note(id).status || '';
    store.setNote(id, { status: 'scartata' });
    toast(`“${D.byId.get(id).nome}” scartata`, { label: 'Annulla', run: () => { store.setNote(id, { status: old }); opts.onChange && opts.onChange(); } });
    opts.onChange && opts.onChange();
  });
  el.querySelector('#cmpCsv').onclick = () => {
    const strip = s => String(s).replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    const rows = [['', ...H.map(h => h.nome)], ...R.filter(r => !r.group).map(r => [strip(r.label), ...H.map(h => strip(r.fn(h)))])];
    download(`casone-confronto-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  };
}
