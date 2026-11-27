// Pagina "Dati": panoramica visiva, verifica delle case forse chiuse, fonti e metodo.
import { $, esc, icon, nf, fmtDate, plural } from './util.js';
import { D, loadDetails, STATO, ZONE, SRC, webLabel } from './data.js';
import { setFilters } from './filters.js';

export async function renderData() {
  const el = $('#view-data');
  const H = D.H, M = D.META, st = M.stats || {};
  const by = (fn) => { const o = {}; H.forEach(h => { const k = fn(h); if (k != null) o[k] = (o[k] || 0) + 1; }); return o; };
  const reg = by(h => h.regione);
  const regMax = Math.max(...Object.values(reg));
  const zon = by(h => h.zona || 'ignota');
  const stato = by(h => h.stato);
  const bins = [[0, 20], [20, 30], [30, 40], [40, 50], [50, 60], [60, 80], [80, 100], [100, 150], [150, 9999]];
  const pc = bins.map(([a, b]) => H.filter(h => h.posti >= a && h.posti < b).length);
  const pbins = [[0, 10], [10, 13], [13, 16], [16, 20], [20, 25], [25, 30], [30, 40], [40, 9999]];
  const prc = pbins.map(([a, b]) => H.filter(h => h._price != null && h._price >= a && h._price < b).length);
  const total = H.length, withPrice = H.filter(h => h.prezzo || h.libera).length;
  const tel = H.filter(h => (h.c || {}).tel).length, wa = H.filter(h => (h.c || {}).wa).length, em = H.filter(h => (h.c || {}).email).length, web = H.filter(h => (h.c || {}).webs === 'online').length;
  const photos = H.reduce((s, h) => s + (h.nf || 0), 0);
  const prob = H.filter(h => h.stato === 'chiusa' || h.stato === 'dubbia').sort((a, b) => (a.stato === 'chiusa' ? 0 : 1) - (b.stato === 'chiusa' ? 0 : 1) || a.nome.localeCompare(b.nome, 'it'));
  const hist = (counts, labels, onClick) => `<div class="hist">${counts.map((n, i) => `<button type="button" data-h="${i}" style="height:${Math.max(2, n / Math.max(...counts) * 100)}%" title="${labels[i]}: ${n} case" aria-label="${labels[i]}: ${n} case"></button>`).join('')}</div><div class="hist-x">${labels.map(l => `<span>${l}</span>`).join('')}</div>`;
  el.innerHTML = `<div class="page-in">
    <div class="page-head"><div><h1>I dati</h1><p>Le case vengono da ${esc(SRC.OR[0])} e ${esc(SRC.CIA[0])}, unite quando sono la stessa struttura. Il ${fmtDate(M.date)} ogni scheda è stata riletta e confrontata con i dati del ${esc(M.date_base || '')}; sono stati controllati anche i siti web delle case.</p></div></div>
    <div class="stats">
      <div class="stat"><b>${nf.format(total)}</b><span>case con autogestione</span></div>
      <div class="stat"><b>${nf.format(photos)}</b><span>foto da schede e siti</span></div>
      <div class="stat"><b>${nf.format((st.geo_esatta || 0) + (st.geo_indirizzo || 0))}</b><span>case con posizione precisa (le altre al centro del comune)</span></div>
      <div class="stat"><b>${nf.format(withPrice)}</b><span>con prezzo o offerta libera</span></div>
      <div class="stat"><b>${nf.format(tel)}</b><span>con telefono · ${nf.format(wa)} WhatsApp · ${nf.format(em)} email</span></div>
      <div class="stat"><b>${nf.format(web)}</b><span>siti web online su ${nf.format((st.web_online || 0) + (st.web_dominio_inesistente || 0) + (st.web_non_verificabile || 0) + (st.web_pagina_inesistente || 0) + (st.web_parcheggiato || 0))} indicati</span></div>
    </div>
    <div class="two">
      <section><h2 style="font-size:19px;font-weight:800;font-stretch:110%;margin-bottom:10px">Case per regione</h2><div class="bars">${Object.entries(reg).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<button type="button" class="bar" data-reg="${esc(r)}"><span>${esc(r)}</span><span class="track"><i style="width:${n / regMax * 100}%"></i></span><span class="n">${n}</span></button>`).join('')}</div></section>
      <div>
        <section><h2 style="font-size:19px;font-weight:800;font-stretch:110%;margin-bottom:6px">Quanti posti letto</h2>${hist(pc, ['<20', '20', '30', '40', '50', '60', '80', '100', '150+'])}</section>
        <section style="margin-top:26px"><h2 style="font-size:19px;font-weight:800;font-stretch:110%;margin-bottom:6px">Prezzo a persona per notte</h2>${hist(prc, ['<10', '10', '13', '16', '20', '25', '30', '40+'])}<p class="small">Su ${nf.format(H.filter(h => h._price != null).length)} case con il prezzo a persona; clic su una colonna per vederle.</p></section>
        <section style="margin-top:26px"><h2 style="font-size:19px;font-weight:800;font-stretch:110%;margin-bottom:10px">Zona</h2><div class="bars">${ZONE.filter(([k]) => zon[k]).map(([k, l]) => `<button type="button" class="bar" data-zona="${k}"><span><span class="dot" style="background:var(--z-${k})"></span> ${l}</span><span class="track"><i style="width:${zon[k] / Math.max(...Object.values(zon)) * 100}%;background:var(--z-${k})"></i></span><span class="n">${zon[k]}</span></button>`).join('')}</div></section>
      </div>
    </div>
    <section class="sect"><h2>Case forse non più operative <small>${plural(stato.chiusa || 0, 'probabilmente chiusa', 'probabilmente chiuse')} · ${plural(stato.dubbia || 0, 'da verificare', 'da verificare')}</small></h2>
      <p style="max-width:70ch">Per ogni casa abbiamo cercato segnali di attività o di chiusura: avvisi nella scheda (“chiusa”, “in ristrutturazione”), sito web con dominio scaduto o parcheggiato, pagina non più esistente, sito fermo da anni. Sono segnali, non certezze: prima di escludere una casa conviene telefonare. Al contrario, ${plural(stato.attiva || 0, 'casa mostra', 'case mostrano')} segnali recenti (calendario con prenotazioni future, sito aggiornato, modulo di contatto attivo).</p>
      <div class="prob-list" id="probList">${prob.map(h => `<div class="prob"><span class="tag ${STATO[h.stato].cls}">${STATO[h.stato].short}</span><div><a href="#/casa/${h.id}">${esc(h.nome)}</a> <span class="small">${esc(h.comune)} (${esc(h.prov)})</span><div class="why" data-why="${h.id}">…</div></div></div>`).join('')}</div>
    </section>
    <section class="sect"><h2>Come leggere i dati</h2><div class="prose" style="font-size:16px">
      <p><b>Posti e prezzi.</b> I posti letto sono quelli dichiarati; se i due portali danno numeri diversi li mostriamo entrambi. Il prezzo viene, in quest'ordine, dalle tariffe per periodo di caseinautogestione.it, dal prezzo indicato nella scheda e, se manca, dai prezzi citati nelle descrizioni o nel sito della casa (segnato come “circa”). Molte case non pubblicano prezzi: in quel caso trovi “prezzo da chiedere”.</p>
      <p><b>Posizione.</b> Per le case di ospitalitareligiosa.it la posizione è quella della mappa nella scheda; per le altre è ricavata dall'indirizzo con OpenStreetMap o, se non trovata, è il centro del comune (indicato come “posizione approssimata”).</p>
      <p><b>Calendario.</b> Le date occupate vengono dal calendario di caseinautogestione.it, che non tutti i gestori aggiornano: una data libera non garantisce la disponibilità.</p>
      <p><b>Le tue liste.</b> Preferite, liste, note e voti restano solo nel tuo browser (nessun account, nessun server). Per non perderli o per condividerli usa “Esporta” in Le mie liste.</p>
      <p><b>Foto.</b> Le foto si caricano direttamente dai portali e dai siti delle case, che ne restano proprietari.</p>
    </div></section>
  </div>`;
  el.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { setFilters({ reg: [b.dataset.reg] }); location.hash = '#/'; });
  el.querySelectorAll('[data-zona]').forEach(b => b.onclick = () => { setFilters({ zona: [b.dataset.zona] }); location.hash = '#/'; });
  const hb = el.querySelectorAll('.hist');
  hb[0].querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const [a, z] = bins[+b.dataset.h]; setFilters({ pmin: a || null, pmax: z < 9999 ? z - 1 : null }); location.hash = '#/'; });
  hb[1].querySelectorAll('[data-h]').forEach(b => b.onclick = () => { const [, z] = pbins[+b.dataset.h]; setFilters({ prmax: z < 9999 ? z : null, prknown: true }); location.hash = '#/'; });
  const det = await loadDetails();
  el.querySelectorAll('[data-why]').forEach(w => {
    const s = (det[w.dataset.why] || {}).segnali || [];
    w.textContent = s.filter(x => x.p < 0).map(x => x.t).join(' · ') || 'Segnali contrastanti';
  });
}
