// Mappa principale (Leaflet + raggruppamento dei punti).
import { esc, fmtEuro, icon } from './util.js';
import { D, ZONE, zoneColor, priceInfo, loadGeo } from './data.js';
import * as store from './store.js';

let map, cluster, markers = new Map(), originLayer = null, hlId = null, ready = false, curBase = null, BASE_REF = null;
// al cambio di tema passa tra mappa chiara e scura (solo se l'utente usa una delle due)
export function themeChanged(dark) {
  if (!map || !BASE_REF || !['Mappa chiara', 'Mappa scura'].includes(curBase)) return;
  const want = dark ? 'Mappa scura' : 'Mappa chiara'; if (want === curBase) return;
  map.removeLayer(BASE_REF[curBase]); BASE_REF[want].addTo(map); curBase = want;
}
let onOpen = () => {}, onOrigin = () => {}, onMove = () => {};
export function setHandlers(h) { onOpen = h.open || onOpen; onOrigin = h.origin || onOrigin; onMove = h.move || onMove; }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const BASES = () => ({
  'Mappa chiara': L.layerGroup([
    L.tileLayer(ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Mappa © Esri, HERE, Garmin, © OpenStreetMap' }),
    L.tileLayer(ESRI + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
  ]),
  'Mappa scura': L.layerGroup([
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Mappa © Esri, HERE, Garmin, © OpenStreetMap' }),
    L.tileLayer(ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
  ]),
  'Topografica': L.tileLayer(ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Mappa © Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap' }),
  'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
  'Satellite': L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Immagini © Esri, Maxar, Earthstar Geographics' }),
});
export function baseLayers() { return BASES(); }

export function initMap() {
  if (map) return map;
  const ITALY = [[36.6, 6.6], [47.1, 18.6]];
  map = L.map('map', { zoomControl: true, preferCanvas: false, worldCopyJump: false, minZoom: 4.5, zoomSnap: 0.25, zoomDelta: 0.5 }).fitBounds(ITALY);
  setTimeout(() => { map.invalidateSize(); map.fitBounds(ITALY); }, 120);
  const bases = BASES();
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  (dark ? bases['Mappa scura'] : bases['Mappa chiara']).addTo(map);
  curBase = dark ? 'Mappa scura' : 'Mappa chiara'; BASE_REF = bases;
  map.on('baselayerchange', e => { curBase = e.name; });
  L.control.layers(bases, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 42, spiderfyOnMaxZoom: true, chunkedLoading: true,
    iconCreateFunction: c => L.divIcon({ html: `<div>${c.getChildCount()}</div>`, className: 'marker-cluster', iconSize: [40, 40] }) });
  map.addLayer(cluster);
  // confini regionali leggeri (utili anche se le tessere della mappa non si caricano)
  loadGeo().then(() => {
    const obj = Object.keys(D.ITA.objects)[0];
    const reg = topojson.mesh(D.ITA, D.ITA.objects[obj], (a, b) => a !== b && a.properties.reg_name !== b.properties.reg_name);
    L.geoJSON(reg, { style: { color: dark ? '#9fb3a8' : '#4d5d55', weight: 1, opacity: .35, dashArray: '3 4' }, interactive: false }).addTo(map);
  });
  map.on('contextmenu', e => onOrigin({ lat: e.latlng.lat, lon: e.latlng.lng, label: 'punto scelto sulla mappa' }));
  map.on('moveend', () => onMove(map.getBounds()));
  map.on('popupopen', e => { const b = e.popup.getElement().querySelector('[data-open]'); if (b) b.onclick = () => onOpen(b.dataset.open); });
  ready = true;
  return map;
}

function markerIcon(h, saved, hl) {
  const cls = ['mk', saved ? 'saved' : '', hl ? 'hl' : '', h.geo === 'comune' ? 'inexact' : ''].join(' ');
  return L.divIcon({ className: '', html: `<div class="${cls}" style="background:${zoneColor(h.zona)}"></div>`, iconSize: saved ? [20, 15] : [14, 14], iconAnchor: saved ? [10, 8] : [7, 7] });
}
function popup(h) {
  const p = priceInfo(h);
  const img = h.foto && h.foto[0] ? `<img src="${esc(h.foto[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="pop">${img}<div class="pb"><b>${esc(h.nome)}</b><span>${esc(h.comune)} (${esc(h.prov)})</span>
    <span><strong>${h.posti || '?'}</strong> posti · ${p.ask ? 'prezzo da chiedere' : esc(p.main) + (p.unit ? ' ' + esc(p.unit) : '')}</span>
    ${h.geo === 'comune' ? '<span class="small">Posizione approssimata (centro del comune)</span>' : ''}
    <button type="button" class="btn small primary" data-open="${h.id}">Apri la scheda</button></div></div>`;
}
export function setData(list) {
  if (!ready) return;
  const saved = store.savedIds();
  cluster.clearLayers();
  const arr = [];
  for (const h of list) {
    if (h.lat == null) continue;
    let m = markers.get(h.id);
    if (!m) {
      m = L.marker([h.lat, h.lon], { icon: markerIcon(h, saved.has(h.id), false), title: h.nome, riseOnHover: true });
      m.bindPopup(() => popup(h), { maxWidth: 260, minWidth: 240 });
      m._h = h; markers.set(h.id, m);
    } else m.setIcon(markerIcon(h, saved.has(h.id), h.id === hlId));
    arr.push(m);
  }
  cluster.addLayers(arr);
}
export function refreshIcons() {
  const saved = store.savedIds();
  markers.forEach((m, id) => m.setIcon(markerIcon(m._h, saved.has(id), id === hlId)));
}
export function highlight(id) {
  const saved = store.savedIds();
  if (hlId && markers.get(hlId)) { const m = markers.get(hlId); m.setIcon(markerIcon(m._h, saved.has(hlId), false)); m.setZIndexOffset(0); }
  hlId = id;
  if (id && markers.get(id)) { const m = markers.get(id); m.setIcon(markerIcon(m._h, saved.has(id), true)); m.setZIndexOffset(1000); }
}
export function focus(id) {
  const m = markers.get(id); if (!m) return;
  cluster.zoomToShowLayer(m, () => m.openPopup());
}
export function fit(list) {
  if (!ready) return;
  const ll = list.filter(h => h.lat != null).map(h => [h.lat, h.lon]);
  if (ll.length) map.fitBounds(ll, { padding: [30, 30], maxZoom: 11 });
}
export function setOrigin(o, km) {
  if (!ready) return;
  if (originLayer) { map.removeLayer(originLayer); originLayer = null; }
  if (!o) return;
  const g = L.layerGroup();
  L.circleMarker([o.lat, o.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#c8102e', fillOpacity: 1 }).bindTooltip('Partenza: ' + o.label).addTo(g);
  if (km) L.circle([o.lat, o.lon], { radius: km * 1000, color: '#c8102e', weight: 1.5, fillOpacity: .04, dashArray: '6 6', interactive: false }).addTo(g);
  g.addTo(map); originLayer = g;
}
export function invalidate(fitList) { if (map) setTimeout(() => { map.invalidateSize(); if (fitList) fit(fitList); }, 80); }
export function bounds() { return map ? map.getBounds() : null; }
export function legend(el) {
  el.innerHTML = ZONE.filter(([k]) => D.H.some(h => (h.zona || 'ignota') === k)).map(([k, l]) => `<span><span class="dot" style="background:var(--z-${k})"></span>${l}</span>`).join('') +
    `<span><span class="dot" style="width:14px;height:10px;border-radius:2px;background:linear-gradient(var(--red) 0 33%,#fff 33% 67%,var(--red) 67%);box-shadow:0 0 0 1px #0002"></span>nelle tue liste</span>` +
    `<span><span class="dot" style="border:1.5px dashed var(--muted);background:transparent"></span>posizione approssimata</span>`;
}

// mappa piccola nella scheda
export function miniMap(el, h, near) {
  const m = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView([h.lat, h.lon], h.geo === 'comune' ? 12 : 14);
  const b = BASES(); b['Topografica'].addTo(m); L.control.layers(b, null, { position: 'topright' }).addTo(m);
  L.marker([h.lat, h.lon], { icon: L.divIcon({ className: '', html: `<div class="mk saved hl"></div>`, iconSize: [20, 15], iconAnchor: [10, 8] }) }).addTo(m).bindTooltip(h.nome);
  if (h.geo === 'comune') L.circle([h.lat, h.lon], { radius: 2500, color: '#a8660b', weight: 1, dashArray: '4 4', fillOpacity: .05 }).addTo(m);
  (near || []).forEach(x => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: '', html: `<div class="mk" style="background:${zoneColor(x.zona)}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(m).bindTooltip(x.nome));
  setTimeout(() => m.invalidateSize(), 120);
  return m;
}
