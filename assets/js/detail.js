// Scheda completa di una casa (finestra laterale), galleria a schermo intero e richiesta di disponibilità.
import { $, $$, esc, icon, nf, fmtEuro, monthsTxt, MON, MONL, hav, toast, fmtDate, todayISO, nightsBetween } from './util.js';
import { D, loadDetails, ZONEL, AMB, TRATTL, ALLOGL, DISTL, FEAT_GROUPS, featLabel, STATO, SRC, MYSTATUS, priceInfo, placeTxt, phoneHref, waHref, webLabel, distFrom, tariffFor, webUsable } from './data.js';
import * as store from './store.js';
import * as M from './map.js';
import { F, stayNights } from './filters.js';
import { listsModal } from './lists.js';

const dlg = () => $('#detail');
let current = null, mini = null, onClose = () => {};
export function setOnClose(fn) { onClose = fn; }

export async function openDetail(id) {
  const h = D.byId.get(id); if (!h) { toast('Casa non trovata'); return false; }
  current = id;
  const d = dlg();
  d.innerHTML = `<div class="d-wrap"><div class="d-bar"><button type="button" class="btn quiet" data-close>${icon('chevron-left')} Torna</button><span class="t">${esc(h.nome)}</span></div><div class="d-body"><p class="small">Carico la scheda…</p></div></div>`;
  if (!d.open) d.showModal();
  const det = (await loadDetails())[id] || {};
  if (current !== id) return true;
  d.innerHTML = render(h, det);
  bind(h, det);
  d.querySelector('.d-wrap').scrollTop = 0;
  return true;
}
export function closeDetail(silent) {
  const d = dlg();
  if (current === null && !d.open) return;
  current = null;
  if (d.open) d.close();
  if (mini) { mini.remove(); mini = null; }
  if (!silent) onClose();
}
export const isOpen = () => dlg().open;

function render(h, det) {
  const n = store.note(h.id);
  const p = priceInfo(h, F.grp, stayNights());
  const photos = det.foto || (h.foto || []).map(s => ({ s, b: s }));
  const nPh = photos.length;
  const mosaic = nPh ? `<div class="mosaic n${Math.min(nPh, 5)}">${photos.slice(0, 5).map((f, i) => `<button type="button" data-lb="${i}" aria-label="Apri foto ${i + 1}"><img src="${esc(i === 0 ? f.b : f.s)}" alt="Foto ${i + 1} di ${esc(h.nome)}" loading="${i ? 'lazy' : 'eager'}" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">${f.o === 'sito' ? '<span class="src-badge">dal sito</span>' : ''}</button>`).join('')}
      ${nPh > 1 ? `<button type="button" class="btn small allph" data-lb="0">${icon('camera')} Tutte le ${nPh} foto</button>` : ''}</div>`
    : `<div class="mosaic n1"><div class="noph" style="position:relative;border-radius:var(--r-l)"><b>${h.posti || '?'}</b><span>posti letto · nessuna foto nelle schede${det.fonti ? ': guardale sul sito della casa' : ''}</span></div></div>`;
  const st = STATO[h.stato];
  const zl = ZONEL[h.zona];
  const ambL = Object.fromEntries(AMB);
  const chips = [
    zl && h.zona !== 'ignota' ? `<span class="tag z" style="background:var(--z-${h.zona})">${esc(zl)}${h.alt ? ' · ' + nf.format(h.alt) + ' m' : ''}</span>` : '',
    ...(h.amb || []).filter(a => ambL[a]).map(a => `<span class="tag">${esc(ambL[a])}</span>`),
    `<span class="tag ${st.cls}">${icon(h.stato === 'attiva' ? 'badge-check' : h.stato === 'ok' ? 'circle-dot' : 'alert')}${esc(st.l)}</span>`,
    h.nuovo ? '<span class="tag">nuova nell\'ultimo aggiornamento</span>' : '',
    h.geo === 'comune' ? '<span class="tag warn">posizione approssimata</span>' : '',
  ].join('');
  const dist = F.origin ? distFrom(h, F.origin) : null;
  const t = F.da ? tariffFor(h, F.da) : null;

  const facts = `<div class="facts">
    <div class="fact"><span class="l">Posti letto</span><span class="v">${h.posti || '?'}</span>${h.posti_alt ? `<span class="s">${h.posti_alt} secondo l'altro portale</span>` : ''}${h.camere || h.bagni ? `<span class="s">${h.camere ? h.camere + ' camere' : ''}${h.camere && h.bagni ? ' · ' : ''}${h.bagni ? h.bagni + ' bagni' : ''}</span>` : ''}</div>
    <div class="fact"><span class="l">Prezzo</span>${p.ask ? `<span class="v ask">da chiedere</span><span class="s">non indicato nelle schede</span>` : `<span class="v">${esc(p.main)}</span><span class="s">${esc([p.unit, p.sub].filter(Boolean).join(' · '))}</span>`}
      ${t && (t.auto || t.semi) ? `<span class="s"><b>Nelle tue date: € ${fmtEuro(t.auto || t.semi)}</b> ${t.auto ? 'autogestione' : 'semigestione'}</span>` : ''}
      ${p.est ? `<span class="s">≈ € ${nf.format(Math.round(p.est))} per ${F.grp} persone${stayNights() ? ' e ' + stayNights() + ' notti' : ' a notte'}</span>` : ''}</div>
    <div class="fact"><span class="l">Minimo</span><span class="v">${h.min_p ? h.min_p + ' <small>persone</small>' : '–'}</span><span class="s">${h.min_n ? 'almeno ' + h.min_n + (h.min_n === 1 ? ' notte' : ' notti') : (det.minimo ? esc(det.minimo).slice(0, 80) : 'nessun minimo indicato')}</span></div>
    <div class="fact"><span class="l">Aperta</span><span class="v" style="font-size:17px">${h.mesi ? esc(monthsTxt(h.mesi)) : '<span class="ask" style="font-style:italic;color:var(--muted)">non indicato</span>'}</span>${h.mesi && h.mesi.length < 12 ? `<div class="months">${MON.map((m, i) => `<span class="${h.mesi.includes(i + 1) ? 'on' : ''}">${m[0].toUpperCase()}</span>`).join('')}</div>` : ''}</div>
    ${dist != null ? `<div class="fact"><span class="l">Da ${esc(F.origin.label)}</span><span class="v">${nf.format(Math.round(dist))} <small>km in linea d'aria</small></span></div>` : ''}
  </div>`;

  // ---- recapiti
  const c = h.c || {};
  const tel = (c.tel || []).map(x => `<a class="crow" href="${esc(phoneHref(x.n))}">${icon(x.k === 'cell' ? 'smartphone' : 'phone')}<span class="cv">${esc(x.n)}</span><span class="ck">${x.k === 'cell' ? 'cellulare' : x.k === 'fisso' ? 'fisso' : 'telefono'}${x.src && !x.src.includes('scheda') ? (x.src.includes('sito') ? '<br>dal sito web' : '<br>trovato sul web') : ''}</span></a>`);
  const wa = (c.wa || []).map(x => `<a class="crow wa" href="${esc(waHref(x))}" target="_blank" rel="noopener">${icon('whatsapp')}<span class="cv">${esc(x)}</span><span class="ck">WhatsApp</span></a>`);
  const em = (c.email || []).map(x => `<a class="crow" href="mailto:${esc(x)}">${icon('mail')}<span class="cv">${esc(x)}</span><span class="ck">email</span></a>`);
  const web = !c.web ? '' : webUsable(c)
    ? `<a class="crow ${c.webs && c.webs !== 'online' ? 'off' : ''}" href="${esc(c.web)}" target="_blank" rel="noopener">${icon('globe')}<span class="cv">${esc(webLabel(c.web))}</span><span class="ck">${esc(webState[c.webs] || 'sito web')}</span></a>`
    : `<div class="crow off">${icon('alert')}<span class="cv" style="text-decoration:line-through">${esc(webLabel(c.web))}</span><span class="ck">${esc(webState[c.webs])}</span></div>`;
  const soc = (c.social || []).map(u => { const k = /instagram/.test(u) ? 'instagram' : /youtube/.test(u) ? 'youtube' : /facebook/.test(u) ? 'facebook' : 'link'; return `<a class="crow" href="${esc(u)}" target="_blank" rel="noopener">${icon(k)}<span class="cv">${esc(k[0].toUpperCase() + k.slice(1))}</span><span class="ck">pagina social</span></a>`; });
  const fonti = det.fonti || [];
  const orF = fonti.find(f => f.s === 'OR');
  const portal = [
    orF && c.form ? `<a class="crow" href="${esc(orF.url)}" target="_blank" rel="noopener">${icon('message')}<span class="cv">Modulo di contatto</span><span class="ck">ospitalitareligiosa.it</span></a>` : '',
    ...(det.cia_contatto || []).map(u => `<a class="crow" href="${esc(u)}" target="_blank" rel="noopener">${icon('message')}<span class="cv">Contatta il gestore</span><span class="ck">caseinautogestione.it<br>(serve registrarsi)</span></a>`),
  ].join('');
  const nothing = !tel.length && !wa.length && !em.length;
  const g = 'https://www.google.com/search?q=' + encodeURIComponent(`"${h.nome}" ${h.comune} telefono`);
  const contactBox = `<div class="box contact"><h3>${icon('send')} Chiedi se è libera</h3>
      <p class="small" style="margin:-4px 0 10px">${nothing ? 'Questa casa non ha telefono né email pubblici: prepara il messaggio e incollalo nel modulo del portale.' : 'Prepara il messaggio con persone e date, poi mandalo con un tocco.'}</p>
      <button type="button" class="btn primary block" data-ask>${icon('send')} Prepara la richiesta</button>
      <div class="clist" style="margin-top:12px">${wa.join('')}${tel.join('')}${em.join('')}${web}${soc.join('')}${portal}
      ${nothing ? `<a class="crow" href="${esc(g)}" target="_blank" rel="noopener">${icon('search')}<span class="cv">Cerca i recapiti sul web</span><span class="ck">Google</span></a>` : ''}</div>
      ${c.fonte ? `<p class="small" style="margin:8px 0 0">Alcuni recapiti non sono nella scheda del portale: li abbiamo trovati sul web (${esc(c.fonte)}).</p>` : ''}
      ${(det.cia_contatto || []).length && nothing ? '<p class="small" style="margin:8px 0 0">Su caseinautogestione.it i recapiti non sono pubblici: si scrive al gestore dal portale (o al portale: 049 9813241).</p>' : ''}</div>`;

  // ---- mie note
  const lists = store.lists();
  const stars = [1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" class="${(n.rating || 0) >= i ? 'on' : ''}" aria-label="${i} stelle">${icon('star')}</button>`).join('');
  const mine = `<div class="box mine"><h3>${icon('bookmark')} Nelle mie case</h3>
    <div class="listtoggles">${lists.map(l => `<button type="button" class="pill" data-list="${l.id}" aria-pressed="${l.ids.includes(h.id)}"><span class="sw" style="background:${esc(l.color)}"></span>${esc(l.name)}</button>`).join('')}<button type="button" class="pill" data-newlist>${icon('plus')} Nuova lista</button></div>
    <label class="lab" for="my-status">A che punto siete</label><select id="my-status" style="width:100%">${MYSTATUS.map(([k, l]) => `<option value="${k}" ${(n.status || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="lab">Il mio voto</label><span class="stars">${stars}</span>
    <label class="lab" for="my-quote">Preventivo / prezzo concordato</label><input type="text" id="my-quote" value="${esc(n.quote || '')}" placeholder="es. € 14 a persona + riscaldamento">
    <label class="lab" for="my-note">Appunti</label><textarea id="my-note" placeholder="es. Telefonato il 3/12, richiamare lunedì; ok per 40 persone">${esc(n.note || '')}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn small" data-share>${icon('share')} Condividi la scheda</button></div>
    ${n.updated ? `<p class="small" style="margin:8px 0 0">Aggiornato il ${fmtDate(n.updated.slice(0, 10))}. Resta in questo browser: per passarlo ad altri usa Esporta in Le mie case.</p>` : '<p class="small" style="margin:8px 0 0">Liste, voti e appunti restano in questo browser.</p>'}</div>`;

  // ---- descrizioni
  const descr = [];
  if (det.descr_or && det.descr_or.length) descr.push([`Dalla scheda di ${SRC.OR[0]}`, det.descr_or]);
  if (det.descr_cia && det.descr_cia.length) descr.push([`Dalla scheda di ${SRC.CIA[0]}`, det.descr_cia]);
  if (det.sito && det.sito.testo && det.sito.testo.length) descr.push([`Dal sito web della casa (${webLabel(det.sito.url)})`, det.sito.testo]);
  const oneDescr = ([lab, ps]) => `<div class="prose ${ps.join(' ').length > 900 ? 'clamp' : ''}" data-prose>${ps.map(x => `<p>${esc(x)}</p>`).join('')}</div>
      ${ps.join(' ').length > 900 ? '<button type="button" class="link" data-expand>Leggi tutto</button>' : ''}<p class="srcnote">${esc(lab)}</p>`;
  const descrHtml = descr.length ? oneDescr(descr[0]) + (descr.length > 1 ? `<details class="more-descr"><summary>${descr.length === 2 ? 'Un’altra descrizione' : `Altre ${descr.length - 1} descrizioni`} (${descr.slice(1).map(d => d[0].replace(/^Dal(la)? (scheda di |sito web della casa )?/, '').replace(/^\(|\)$/g, '')).join(', ')})</summary>${descr.slice(1).map(d => `<div style="margin-top:14px">${oneDescr(d)}</div>`).join('')}</details>` : '')
    : (det.sintesi ? `<div class="prose"><p>${esc(det.sintesi)}</p></div>` : '<p class="small">Nessuna descrizione nelle schede.</p>');

  // ---- servizi
  const featHtml = `<div class="feat-groups">${FEAT_GROUPS.map(([g, keys]) => {
    const yes = keys.filter(k => h._f.has(k));
    return yes.length ? `<div><h4>${esc(g)}</h4><ul class="flist">${yes.map(k => `<li>${icon('check')}${esc(featLabel(k))}</li>`).join('')}</ul></div>` : '';
  }).join('')}
    ${(h.allog || []).length ? `<div><h4>Alloggi</h4><ul class="flist">${h.allog.map(k => `<li>${icon('bed')}${esc(ALLOGL[k] || k)}</li>`).join('')}</ul></div>` : ''}
    ${(h.tratt || []).length ? `<div><h4>Trattamento</h4><ul class="flist">${h.tratt.map(k => `<li>${icon('check')}${esc(TRATTL[k] || k)}</li>`).join('')}</ul></div>` : ''}
  </div>`;

  // ---- dettagli caseinautogestione.it (cucina, accessi, divieti...)
  const cia = (det.cia || [])[0];
  let ciaHtml = '';
  if (cia && cia.sezioni) {
    const S = cia.sezioni;
    const yesList = (title, skip = []) => (S[title] || []).filter(it => it[1] === true && it[0] && !skip.includes(it[0])).map(it => esc(it[0].replace(/^con /, '')) + (it[2] && it[2] !== 'si' ? ` <span class="small">(${esc(it[2])})</span>` : ''));
    const txt = title => (S[title] || []).filter(it => typeof it[1] === 'string' && it[1]).map(it => [it[0], it[1]]);
    const blocks = [
      ['Cucina', yesList('Cucina')], ['Spazio esterno', yesList('Spazio esterno')], ['Come si arriva', yesList('Raggiungibile')],
      ['Accesso disabili', yesList('Accesso disabili')], ['Servizi aggiuntivi', yesList('Servizi aggiuntivi')], ['Dotazioni', yesList('Posti/Camere/Piani')],
    ].filter(b => b[1].length);
    const piani = txt('Posti/Camere/Piani');
    const vic = txt('Nelle vicinanze'), div = txt('Divieti');
    ciaHtml = `<div class="feat-groups wide">${blocks.map(([t, l]) => `<div><h4>${esc(t)}</h4><ul class="flist wrap">${l.map(x => `<li>${icon('check')}<span>${x}</span></li>`).join('')}</ul></div>`).join('')}</div>
      ${piani.length || vic.length || div.length ? `<dl class="kv" style="margin-top:18px">${[...piani, ...vic, ...div].map(([k, v]) => `<dt>${esc(k.replace(/:$/, ''))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}`;
  }

  // ---- altre informazioni
  const kv = [
    ['Indirizzo', h.ind ? esc(h.ind) : ''],
    ['Tipo di struttura', esc((h.tipi || []).join(', '))], ['Gestita da', esc(h.gest)], ['Proprietà / ente', esc(det.ente)],
    ['Trattamento', esc(det.gestione_txt)], ['Ambiente', esc(det.zona_txt)], ['Alloggi', esc(det.alloggi_txt)], ['Camere', esc(det.camere_txt)], ['Bagni', esc(det.bagni_txt)],
    ['Cucina', esc(det.cucina)], ['Spazi comuni', esc(det.sale)], ['Spazi esterni', esc(det.esterni)], ['Sport', esc(det.sport)], ['Pasti', esc(det.pasti)],
    ['Dotazioni camere', esc(det.dotazioni)], ['Biancheria', esc(det.biancheria)], ['Servizi (scheda)', esc(det.servizi_txt)],
    ['Adatta a', esc(det.profilo_txt || (h.prof || []).map(k => D.META.codes.p[k]).join(', '))], ['Tipo di soggiorno', esc(det.motivo_txt || (h.mot || []).map(k => D.META.codes.m[k]).join(', '))],
    ['Condizioni', esc(det.minimo)], ['Periodi', esc([det.periodi, det.periodi_cia].filter(Boolean).join(' · '))], ['Avvisi', esc(det.avvisi)], ['Regole', esc(det.regole)],
    ['Nei dintorni', esc(det.vicino)], ['Codice CIN', esc(h.cin)], ['Altri nomi', esc((det.alias || []).join(', '))],
  ].filter(r => r[1]);
  const distHtml = h.dist ? Object.entries(h.dist).sort((a, b) => a[1] - b[1]).map(([k, v]) => `<span>${esc(DISTL[k] || k)}: <b>${v <= 0.2 ? 'entro 200 m' : v <= 1 ? 'entro 1 km' : (String(v).replace('.', ',') + ' km')}</b></span>`).join(' · ') : '';

  // ---- prezzi e tariffe
  const tar = h.tar || [];
  const priceSect = `
    ${tar.length ? `<div class="tscroll"><table class="tartable"><thead><tr><th>Periodo</th><th>Autogestione</th><th>Semigestione</th><th>Min. persone</th><th>Caparra</th></tr></thead><tbody>${tar.map(x => `<tr><td>${esc(x.periodo || '')}</td><td class="n">${x.auto ? '€ ' + fmtEuro(x.auto) : '–'}</td><td class="n">${x.semi ? '€ ' + fmtEuro(x.semi) : '–'}</td><td class="n">${x.min_posti || '–'}</td><td class="n">${x.caparra ? '€ ' + fmtEuro(x.caparra) : '–'}</td></tr>`).join('')}</tbody></table></div><p class="srcnote">Prezzi a persona al giorno, da caseinautogestione.it.</p>` : ''}
    ${det.prezzi_scheda ? `<p><b>Dalla scheda:</b> ${esc(det.prezzi_scheda)}</p>` : ''}
    ${(det.prezzi_txt || []).length ? `<p style="margin-bottom:4px"><b>Prezzi citati nei testi</b></p><ul class="flist">${det.prezzi_txt.map(x => `<li>${icon('euro')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
    ${(det.costi_extra || []).length ? `<p style="margin:12px 0 4px"><b>Costi extra e caparre</b></p><ul class="flist">${det.costi_extra.map(x => `<li>${icon('info')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
    ${!tar.length && !det.prezzi_scheda && !(det.prezzi_txt || []).length ? `<p>${h.libera ? 'Offerta libera (di solito più le utenze).' : 'Il prezzo non è indicato: chiedilo con la richiesta di disponibilità.'}</p>` : ''}`;

  // ---- calendario (solo caseinautogestione.it)
  const hasCal = (h.src || []).includes('CIA');
  const calHtml = hasCal ? calendar(h) : '';

  // ---- verifica
  const sig = det.segnali || [];
  const sito = det.sito;
  const verify = `<ul class="signals">${sig.length ? sig.map(s => `<li class="${s.p > 0 ? 'p' : s.p < 0 ? 'n' : 'z'}">${icon(s.p > 0 ? 'check' : s.p < 0 ? 'alert' : 'info')}<span style="color:var(--ink)">${esc(s.t)}</span></li>`).join('') : `<li class="z">${icon('info')}<span>Nessun segnale particolare: la scheda è presente sul portale.</span></li>`}</ul>
    ${sito && sito.generico ? `<p class="small" style="margin-top:10px">Il sito indicato (<a href="${esc(sito.url)}" target="_blank" rel="noopener">${esc(webLabel(sito.url))}</a>) è quello generale dell'ente o dell'associazione e non parla di questa casa: non ne abbiamo preso testi, foto o recapiti.</p>` : ''}
    ${sito && sito.url && sito.titolo && !sito.generico ? `<p class="small" style="margin-top:10px">Sito controllato: <a href="${esc(sito.url)}" target="_blank" rel="noopener">${esc(webLabel(sito.url))}</a> — “${esc(sito.titolo)}”${sito.pagine ? ` · ${sito.pagine.length} pagine lette` : ''}</p>` : ''}
    ${sito && sito.stato && sito.stato !== 'online' ? `<p class="small">Sito indicato: ${esc(webLabel(sito.url || ''))} — ${esc(webState[sito.stato] || sito.stato)}${sito.verso ? ` (${esc(sito.verso)}): non lo apriamo` : ''}${sito.stato === 'non_verificabile' ? ' (risponde solo senza https o con certificato non valido: provalo dal tuo browser)' : ''}</p>` : ''}
    ${(det.cambi || []).length ? `<p style="margin:14px 0 4px"><b>Cosa è cambiato rispetto ai dati del ${esc(D.META.date_base || '')}</b></p><ul class="flist">${det.cambi.map(x => `<li>${icon('refresh')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
    <p class="small" style="margin-top:12px">Annunci: ${fonti.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(SRC[f.s][1])} ${icon('external')}</a>`).join(' · ')}${(det.altri || []).map(a => ` · <a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nome)} ${icon('external')}</a>`).join('')}${h.visite ? ` · ${nf.format(h.visite)} visualizzazioni su ospitalitareligiosa.it` : ''}</p>`;

  // ---- vicine e collegate
  const near = D.H.filter(x => x.id !== h.id && x.lat != null && x.stato !== 'chiusa').map(x => [x, hav(h.lat, h.lon, x.lat, x.lon)]).sort((a, b) => a[1] - b[1]).slice(0, 6);
  const coll = det.collegate ? `<p class="small">${esc(det.collegate.label)}: ${det.collegate.ids.map(i => D.byId.get(i)).filter(Boolean).map(x => `<a href="#/casa/${x.id}">${esc(x.nome)} (${x.posti} posti)</a>`).join(', ')}</p>` : '';
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.geo === 'esatta' ? h.lat + ',' + h.lon : (h.ind || h.comune + ' ' + h.prov))}`;
  const dir = `https://www.google.com/maps/dir/?api=1${F.origin ? '&origin=' + F.origin.lat + ',' + F.origin.lon : ''}&destination=${encodeURIComponent(h.geo !== 'comune' ? h.lat + ',' + h.lon : (h.ind || h.comune))}`;

  const vid = (det.video || []);
  return `<div class="d-wrap"><div class="d-bar"><button type="button" class="btn quiet" data-close>${icon('chevron-left')} Torna</button><span class="t">${esc(h.nome)}</span>
      <button type="button" class="btn small" data-favtop aria-pressed="${store.savedIds().has(h.id)}">${icon('bookmark')}<span>${store.savedIds().has(h.id) ? 'Salvata' : 'Salva'}</span></button>
      <button type="button" class="iconbtn" data-print title="Stampa" aria-label="Stampa">${icon('printer')}</button>
      <button type="button" class="iconbtn" data-close aria-label="Chiudi">${icon('x')}</button></div>
    <div class="d-body">
      ${mosaic}
      <div class="d-head">
        <div>
          <div class="d-title"><h1 id="dTitle">${esc(h.nome)}</h1><div class="place">${esc(h.tipo ? h.tipo + ' · ' : '')}${esc(placeTxt(h))}</div></div>
          <div class="d-chips">${chips}</div>
          ${h.stato === 'chiusa' ? `<p class="badbox" style="margin-top:14px">${icon('alert')} ${esc((sig.find(s => s.p < 0) || {}).t || 'Probabilmente chiusa')}. Verifica prima di organizzare.</p>` : h.stato === 'dubbia' ? `<p class="warnbox" style="margin-top:14px">${icon('alert')} ${esc((sig.find(s => s.p < 0) || {}).t || 'Da verificare')}: conviene telefonare prima.</p>` : ''}
          ${facts}
          <nav class="secnav" aria-label="Sezioni della scheda">${[['s-descr', 'Descrizione'], ['s-serv', 'Spazi e servizi'], ['s-prezzi', 'Prezzi'], calHtml ? ['s-cal', 'Calendario'] : null, ['s-dove', 'Dove si trova'], ['s-info', 'Tutto il resto'], ['s-contatti', 'Contatti e note', 'm']].filter(Boolean).map(([id, l, m]) => [id, l, m]).map(([id, l, m]) => `<a href="#${id}" data-jump="${id}" class="${m ? 'only-mobile' : ''}">${l}</a>`).join('')}</nav>
          <section class="sect" id="s-descr"><h2>Descrizione</h2>${descrHtml}</section>
          <section class="sect" id="s-serv"><h2>Spazi e servizi</h2>${featHtml}
            ${ciaHtml ? `<details class="sub"><summary>Più dettagli: cucina, accessi, divieti <small>da caseinautogestione.it</small></summary><div style="margin-top:14px">${ciaHtml}</div></details>` : ''}</section>
          <section class="sect" id="s-prezzi"><h2>Prezzi e condizioni</h2>${priceSect}</section>
          ${calHtml ? `<section class="sect" id="s-cal"><h2>Disponibilità <small>giorni già prenotati secondo il calendario del portale</small></h2>${calHtml}</section>` : ''}
          ${vid.length ? `<section class="sect"><h2>Video</h2>${vid.map(v => `<div class="video" style="margin-bottom:12px"><button type="button" data-yt="${esc(v)}" style="background-image:url(https://i.ytimg.com/vi/${esc(v)}/hqdefault.jpg)"><span>${icon('play')} Guarda il video</span></button></div>`).join('')}<p class="srcnote">Il video si carica da YouTube solo quando lo avvii.</p></section>` : ''}
          <section class="sect" id="s-dove"><h2>Dove si trova</h2>
            <div class="mini-map" id="miniMap"></div>
            <p class="small" style="margin-top:8px">${h.geo === 'esatta' ? 'Posizione indicata nella scheda del portale.' : h.geo === 'indirizzo' ? "Posizione ricavata dall'indirizzo." : 'Posizione approssimata: centro del comune.'} <a href="${esc(gmaps)}" target="_blank" rel="noopener">Apri in Google Maps ${icon('external')}</a> · <a href="${esc(dir)}" target="_blank" rel="noopener">Indicazioni stradali ${icon('external')}</a></p>
            ${distHtml ? `<p style="margin-top:8px">${distHtml}</p>` : ''}
          </section>
          <section class="sect" id="s-info"><h2>Tutto il resto</h2>
            ${kv.length ? `<details class="sub"><summary>Tutte le informazioni delle schede <small>${kv.length} voci</small></summary><dl class="kv" style="margin-top:14px">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></details>` : ''}
            <details class="sub" ${h.stato === 'dubbia' || h.stato === 'chiusa' ? 'open' : ''}><summary>È ancora attiva? <small>${esc(st.l.toLowerCase())}, verifica del ${fmtDate(D.META.date)}</small></summary><div style="margin-top:14px">${verify}</div></details>
          </section>
          <section class="sect"><h2>Case vicine</h2>${coll}<div class="near">${near.map(([x, km]) => `<a href="#/casa/${x.id}">${x.foto && x.foto[0] ? `<img src="${esc(x.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '<span class="ni"></span>'}<span><b>${esc(x.nome)}</b><small>${x.posti || '?'} posti · ${km < 1 ? 'meno di 1 km' : nf.format(Math.round(km)) + ' km'}</small></span></a>`).join('')}</div></section>
        </div>
        <aside class="side" id="s-contatti">${contactBox}${mine}</aside>
      </div>
    </div>
    <div class="d-cta only-mobile"><button type="button" class="btn primary" data-ask>${icon('send')} Prepara la richiesta</button>
      ${(c.wa || [])[0] ? `<a class="btn" href="${esc(waHref(c.wa[0]))}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}
      ${(c.tel || [])[0] ? `<a class="btn" href="${esc(phoneHref(c.tel[0].n))}" aria-label="Telefona">${icon('phone')}</a>` : ''}
      <a class="btn" href="#s-contatti" data-jump="s-contatti" aria-label="Tutti i contatti e le mie note">${icon('bookmark')}</a></div></div>`;
}

const webState = { online: 'sito online', parcheggiato: 'dominio parcheggiato', dominio_inesistente: 'il dominio non esiste più', pagina_inesistente: 'pagina non trovata', non_verificabile: 'non verificabile da qui', reindirizzato: 'ora rimanda a un altro sito' };

function calendar(h) {
  const busy = new Set();
  for (const [s, e] of h.occ || []) { const d = new Date(s + 'T12:00:00'), end = new Date(e + 'T12:00:00'); for (; d <= end; d.setDate(d.getDate() + 1)) busy.add(d.toISOString().slice(0, 10)); }
  const today = todayISO(), start = new Date(today.slice(0, 7) + '-01T12:00:00');
  const sel = new Set();
  if (F.da) {
    if (!F.a) sel.add(F.da);
    else for (const d = new Date(F.da + 'T12:00:00'), e = new Date(F.a + 'T12:00:00'); d < e; d.setDate(d.getDate() + 1)) sel.add(d.toISOString().slice(0, 10));
  }
  const nb0 = [...busy].filter(d => d >= today).length;
  let html = `<div class="cal" ${nb0 ? '' : 'hidden'} data-cal>`;
  for (let i = 0; i < 12; i++) {
    const m = new Date(start); m.setMonth(start.getMonth() + i);
    const y = m.getFullYear(), mo = m.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate();
    html += `<div class="mo" ${i >= 6 ? 'data-more hidden' : ''}><h4>${MONL[mo]} ${y}</h4><div class="days">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(x => `<span class="h">${x}</span>`).join('')}${'<span></span>'.repeat(first)}`;
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = [iso < today ? 'past' : busy.has(iso) ? 'busy' : (h.mesi && !h.mesi.includes(mo + 1) ? '' : 'free'), sel.has(iso) ? 'sel' : ''].join(' ');
      html += `<span class="${cls}" title="${busy.has(iso) ? 'già prenotato' : ''}">${d}</span>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  const nb = nb0;
  return html + `<p class="srcnote">${nb ? `${nb} giorni segnati come già prenotati nei prossimi mesi (in rosso). ` : 'Nessun giorno segnato come prenotato nei prossimi mesi: il calendario potrebbe non essere aggiornato, chiedi sempre conferma. '}<button type="button" class="link" data-calmore>${nb ? 'Mostra 12 mesi' : 'Mostra il calendario'}</button></p>`;
}

function bind(h, det) {
  const d = dlg();
  d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeDetail());
  const wrap = d.querySelector('.d-wrap'), bar = d.querySelector('.d-bar');
  wrap.addEventListener('scroll', () => bar.classList.toggle('scrolled', wrap.scrollTop > 260), { passive: true });
  d.querySelectorAll('[data-lb]').forEach(b => b.onclick = () => lightbox(det.foto || (h.foto || []).map(s => ({ s, b: s })), +b.dataset.lb, h));
  const cm = d.querySelector('[data-calmore]');
  if (cm) cm.onclick = () => { const c = d.querySelector('[data-cal]'); if (c.hidden) { c.hidden = false; cm.textContent = 'Mostra 12 mesi'; } else { c.querySelectorAll('[data-more]').forEach(x => x.hidden = false); cm.remove(); } };
  d.querySelectorAll('[data-expand]').forEach(b => b.onclick = () => { b.previousElementSibling.classList.remove('clamp'); b.remove(); });
  d.querySelectorAll('[data-yt]').forEach(b => b.onclick = () => { b.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video di ${esc(h.nome)}"></iframe>`; });
  d.querySelector('[data-print]').onclick = () => window.print();
  const ft = d.querySelector('[data-favtop]');
  const syncFt = () => { const on = store.savedIds().has(h.id); ft.setAttribute('aria-pressed', on); ft.querySelector('span').textContent = on ? 'Salvata' : 'Salva'; syncListPills(h); M.refreshIcons(); };
  ft.onclick = () => {
    if (store.savedIds().has(h.id)) { listsModal(h.id, syncFt); return; }
    store.toggleList('fav', h.id, true); syncFt(); toast('Salvata nelle Preferite', { label: 'Altre liste', run: () => listsModal(h.id, syncFt) });
  };
  d.querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const t = d.querySelector('#' + a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  d.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => askModal(h));
  d.querySelectorAll('[data-list]').forEach(b => b.onclick = () => { const on = store.toggleList(b.dataset.list, h.id); b.setAttribute('aria-pressed', on); syncFt(); });
  d.querySelector('[data-newlist]').onclick = () => {
    const name = prompt('Nome della nuova lista (es. "Campo estivo 2027")'); if (!name) return;
    const l = store.createList(name); store.toggleList(l.id, h.id, true); openDetail(h.id); toast(`Creata la lista "${l.name}"`);
  };
  d.querySelector('#my-status').onchange = e => { store.setNote(h.id, { status: e.target.value }); syncFt(); };
  d.querySelectorAll('[data-star]').forEach(b => b.onclick = () => {
    const cur = store.note(h.id).rating || 0, v = +b.dataset.star === cur ? 0 : +b.dataset.star;
    store.setNote(h.id, { rating: v }); d.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= v));
  });
  let tq; d.querySelector('#my-quote').oninput = e => { clearTimeout(tq); tq = setTimeout(() => store.setNote(h.id, { quote: e.target.value }), 300); };
  let tn; d.querySelector('#my-note').oninput = e => { clearTimeout(tn); tn = setTimeout(() => store.setNote(h.id, { note: e.target.value }), 300); };
  d.querySelector('[data-share]').onclick = async () => {
    const url = location.origin + location.pathname + '#/casa/' + h.id;
    if (navigator.share) { try { await navigator.share({ title: h.nome, text: `${h.nome} – ${h.comune} (${h.posti} posti)`, url }); return; } catch (e) { } }
    try { await navigator.clipboard.writeText(url); toast('Link alla scheda copiato'); } catch (e) { prompt('Copia il link:', url); }
  };
  // mappa piccola
  const near = D.H.filter(x => x.id !== h.id && x.lat != null).map(x => [x, hav(h.lat, h.lon, x.lat, x.lon)]).filter(x => x[1] < 15).sort((a, b) => a[1] - b[1]).slice(0, 12).map(x => x[0]);
  if (mini) { mini.remove(); mini = null; }
  setTimeout(() => { const el = d.querySelector('#miniMap'); if (el) mini = M.miniMap(el, h, near); }, 50);
}
function syncListPills(h) { dlg().querySelectorAll('[data-list]').forEach(b => b.setAttribute('aria-pressed', store.inList(b.dataset.list, h.id))); }

// ------------------------------------------------------------ galleria
export function lightbox(photos, start, h) {
  const lb = $('#lightbox'); let i = start || 0;
  const draw = () => {
    const f = photos[i];
    lb.innerHTML = `<div class="lb"><div class="lb-top"><b>${esc(h.nome)}</b><span>${i + 1} / ${photos.length}${f.o === 'sito' ? ' · dal sito della casa' : f.o ? ' · da ' + esc(SRC[f.o] ? SRC[f.o][0] : f.o) : ''}</span><span class="sp"></span>
      <a href="${esc(f.b)}" target="_blank" rel="noopener" class="btn small quiet" style="color:#fff">${icon('external')} Originale</a>
      <button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
      <div class="lb-stage"><img src="${esc(f.b)}" alt="Foto ${i + 1} di ${esc(h.nome)}" referrerpolicy="no-referrer">
      ${photos.length > 1 ? `<button type="button" class="navb l" data-d="-1" aria-label="Precedente">${icon('chevron-left')}</button><button type="button" class="navb r" data-d="1" aria-label="Successiva">${icon('chevron-right')}</button>` : ''}</div>
      <div class="lb-strip">${photos.map((p, j) => `<button type="button" data-j="${j}" class="${j === i ? 'on' : ''}" aria-label="Foto ${j + 1}"><img src="${esc(p.s)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div></div>`;
    lb.querySelector('[data-x]').onclick = () => lb.close();
    lb.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { i = (i + +b.dataset.d + photos.length) % photos.length; draw(); });
    lb.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { i = +b.dataset.j; draw(); });
    const on = lb.querySelector('.lb-strip .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    let x0 = null; const st = lb.querySelector('.lb-stage');
    st.ontouchstart = e => { x0 = e.touches[0].clientX; };
    st.ontouchend = e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { i = (i + (dx < 0 ? 1 : -1) + photos.length) % photos.length; draw(); } x0 = null; };
  };
  lb.onkeydown = e => { if (e.key === 'ArrowRight') { i = (i + 1) % photos.length; draw(); } if (e.key === 'ArrowLeft') { i = (i - 1 + photos.length) % photos.length; draw(); } };
  draw(); lb.showModal();
}

// ------------------------------------------------------------ richiesta di disponibilità
export function askModal(h, after) {
  const m = $('#modal'), c = h.c || {};
  const P = store.state().prefs;
  const draft = { gruppo: P.ask_gruppo || '', referente: P.ask_referente || '', tel: P.ask_tel || '', persone: F.grp || '', da: F.da || '', a: F.a || '', tipo: P.ask_tipo || 'autogestione', extra: '',
    // senza date precise: il periodo scelto nella ricerca (es. "ad agosto, per 3 notti")
    periodo: [F.mesi.length ? (/^[aeiou]/.test(MONL[F.mesi[0] - 1]) ? 'ad ' : 'a ') + [...F.mesi].sort((a, b) => a - b).map(m => MONL[m - 1]).join(' o ') : '', stayNights() ? `per ${stayNights()} notti` : ''].filter(Boolean).join(', ') };
  const text = d => {
    const per = d.da ? (d.a ? `dal ${fmtDate(d.da, { day: 'numeric', month: 'long', year: 'numeric' })} al ${fmtDate(d.a, { day: 'numeric', month: 'long', year: 'numeric' })}${nightsBetween(d.da, d.a) > 0 ? ` (${nightsBetween(d.da, d.a)} notti)` : ''}` : `a partire dal ${fmtDate(d.da, { day: 'numeric', month: 'long', year: 'numeric' })}`) : (d.periodo ? `${d.periodo} (date da concordare)` : 'nelle date da concordare');
    return `Buongiorno,\n${d.gruppo ? `scrivo per ${d.gruppo}: ` : ''}siamo un gruppo di ${d.persone || '…'} persone e cerchiamo una casa in ${d.tipo} ${per}.\n\nVorremmo sapere se "${h.nome}" a ${h.comune} è disponibile e a quali condizioni: prezzo a persona o per la casa, utenze e riscaldamento, caparra, biancheria, pulizie finali.${d.extra ? '\n\n' + d.extra : ''}\n\nGrazie, un saluto\n${d.referente || ''}${d.tel ? '\n' + d.tel : ''}`;
  };
  const draw = () => {
    const body = text(draft);
    const subj = `Richiesta disponibilità per ${draft.persone || ''} persone${draft.da ? ' – ' + fmtDate(draft.da) : ''}`;
    const mails = (c.email || []).map(e => `<a class="btn" href="mailto:${esc(e)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}">${icon('mail')} Email a ${esc(e)}</a>`);
    const was = (c.wa || []).map(w => `<a class="btn" href="${esc(waHref(w, body))}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp ${esc(w)}</a>`);
    const cells = (c.tel || []).filter(t => t.k === 'cell' && !(c.wa || []).some(w => w.replace(/\D/g, '').endsWith(t.n.replace(/\D/g, '').slice(-9)))).slice(0, 1).map(t => `<a class="btn" href="${esc(waHref(t.n, body))}" target="_blank" rel="noopener" title="Se il numero usa WhatsApp">${icon('whatsapp')} Prova WhatsApp ${esc(t.n)}</a>`);
    m.innerHTML = `<div class="m-head"><h2>Richiesta di disponibilità</h2><button type="button" class="iconbtn" data-x aria-label="Chiudi">${icon('x')}</button></div>
      <div class="m-body">
        <div class="big-num"><label class="small">Gruppo / associazione<input type="text" data-k="gruppo" value="${esc(draft.gruppo)}" placeholder="es. Parrocchia San Luca"></label><label class="small">Persone<input type="number" data-k="persone" value="${esc(draft.persone)}" min="1"></label></div>
        <div class="big-num"><label class="small">Arrivo<input type="date" data-k="da" value="${esc(draft.da)}"></label><label class="small">Partenza<input type="date" data-k="a" value="${esc(draft.a)}"></label></div>
        <div class="big-num"><label class="small">Firma<input type="text" data-k="referente" value="${esc(draft.referente)}" placeholder="Nome e cognome"></label><label class="small">Telefono<input type="text" data-k="tel" value="${esc(draft.tel)}"></label></div>
        <label class="small">Trattamento<select data-k="tipo" style="width:100%"><option ${draft.tipo === 'autogestione' ? 'selected' : ''}>autogestione</option><option ${draft.tipo === 'semigestione' ? 'selected' : ''}>semigestione</option><option ${draft.tipo === 'autogestione o semigestione' ? 'selected' : ''}>autogestione o semigestione</option></select></label>
        <label class="small">Altro da chiedere<textarea data-k="extra" placeholder="es. Serve una sala per 40 persone e lo spazio per un falò">${esc(draft.extra)}</textarea></label>
        <label class="small">Testo del messaggio<textarea id="askText" style="min-height:190px" readonly>${esc(body)}</textarea></label>
      </div>
      <div class="m-foot">${was.join('')}${cells.join('')}${mails.join('')}<button type="button" class="btn" data-copy>${icon('copy')} Copia il testo</button><button type="button" class="btn primary" data-done>${icon('check')} Segna come contattata</button></div>`;
    m.querySelector('[data-x]').onclick = () => m.close();
    const relink = () => {
      const body2 = text(draft), subj2 = `Richiesta disponibilità per ${draft.persone || ''} persone${draft.da ? ' – ' + fmtDate(draft.da) : ''}`;
      m.querySelector('#askText').value = body2;
      m.querySelectorAll('.m-foot a[href^="mailto:"]').forEach(a => { const to = a.getAttribute('href').slice(7).split('?')[0]; a.href = `mailto:${to}?subject=${encodeURIComponent(subj2)}&body=${encodeURIComponent(body2)}`; });
      m.querySelectorAll('.m-foot a[href*="wa.me"]').forEach(a => { a.href = a.href.split('?')[0] + '?text=' + encodeURIComponent(body2); });
    };
    m.querySelectorAll('[data-k]').forEach(el => el.onchange = el.oninput = () => {
      draft[el.dataset.k] = el.value; relink();
      if (['gruppo', 'referente', 'tel', 'tipo'].includes(el.dataset.k)) store.setPref('ask_' + el.dataset.k, el.value);
    });
    m.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(text(draft)); toast('Testo copiato'); } catch (e) { m.querySelector('#askText').select(); } };
    m.querySelector('[data-done]').onclick = () => {
      const n = store.note(h.id);
      store.setNote(h.id, { status: 'contattata', note: [n.note, `Richiesta inviata il ${fmtDate(todayISO())} per ${draft.persone || '?'} persone${draft.da ? ' dal ' + fmtDate(draft.da) : ''}.`].filter(Boolean).join('\n') });
      m.close(); if (isOpen()) openDetail(h.id); if (after) after(); toast('Segnata come contattata: la trovi in Le mie case');
    };
  };
  draw(); m.showModal();
}
