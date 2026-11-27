// Dati personali dell'utente, salvati solo in questo browser (localStorage).
// Liste (con "Preferite" fissa), note/stato/voto per casa, confronto, ricerche salvate, preferenze.
// Tutto si può esportare in un file JSON e reimportare (sostituendo, unendo o come liste separate).

import { MYSTATUSL } from './data.js';

const KEY = 'casone:v1';
const listeners = new Set();
export const COLORS = ['#c8102e', '#2d5b46', '#2d6fa3', '#a8743a', '#76589f', '#1f8f9c', '#d0681d', '#5d6a62'];

function blank() {
  return {
    version: 1,
    lists: [{ id: 'fav', name: 'Preferite', color: COLORS[0], ids: [], fixed: true, created: new Date().toISOString() }],
    notes: {},        // id casa -> {status, rating, note, quote, updated}
    compare: [],      // id case da confrontare (max 6)
    saved: [],        // ricerche salvate {id, name, filters, created}
    prefs: {},        // tema, vista, gruppo, origine...
    filters: null,    // ultimi filtri usati
  };
}

let S = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = { ...blank(), ...JSON.parse(raw) };
    if (!s.lists.find(l => l.id === 'fav')) s.lists.unshift(blank().lists[0]);
    return s;
  } catch (e) { return blank(); }
}
let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('salvataggio non riuscito', e); } }, 120);
}
function emit(what) { persist(); listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); }
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const state = () => S;

// ---- liste
export const lists = () => S.lists;
export const getList = id => S.lists.find(l => l.id === id);
export const inList = (lid, hid) => !!getList(lid)?.ids.includes(hid);
export const isFav = hid => inList('fav', hid);
export function toggleList(lid, hid, on) {
  const l = getList(lid); if (!l) return false;
  const has = l.ids.includes(hid);
  const want = on == null ? !has : on;
  if (want && !has) l.ids.unshift(hid);
  if (!want && has) l.ids = l.ids.filter(x => x !== hid);
  l.updated = new Date().toISOString();
  emit('lists'); return want;
}
export function createList(name, color) {
  const l = { id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.trim() || 'Nuova lista', color: color || COLORS[S.lists.length % COLORS.length], ids: [], created: new Date().toISOString() };
  S.lists.push(l); emit('lists'); return l;
}
export function updateList(id, patch) { const l = getList(id); if (!l) return; Object.assign(l, patch, { updated: new Date().toISOString() }); emit('lists'); }
export function deleteList(id) { const l = getList(id); if (!l || l.fixed) return; S.lists = S.lists.filter(x => x.id !== id); emit('lists'); return l; }
export function restoreList(l) { S.lists.push(l); emit('lists'); }
export const listsOf = hid => S.lists.filter(l => l.ids.includes(hid));
export const savedIds = () => new Set(S.lists.flatMap(l => l.ids));

// ---- note personali
export const note = hid => S.notes[hid] || {};
export function setNote(hid, patch) {
  const n = { ...(S.notes[hid] || {}), ...patch, updated: new Date().toISOString() };
  Object.keys(n).forEach(k => { if (n[k] === '' || n[k] == null || n[k] === 0) delete n[k]; });
  if (Object.keys(n).length <= 1) delete S.notes[hid]; else S.notes[hid] = n;
  emit('notes');
}

// ---- confronto
export const compare = () => S.compare;
export const inCompare = hid => S.compare.includes(hid);
export function toggleCompare(hid) {
  if (S.compare.includes(hid)) S.compare = S.compare.filter(x => x !== hid);
  else { if (S.compare.length >= 6) return null; S.compare.push(hid); }
  emit('compare'); return S.compare.includes(hid);
}
export function setCompare(ids) { S.compare = [...new Set(ids)].slice(0, 6); emit('compare'); }

// ---- ricerche salvate e preferenze
export function saveSearch(name, filters) { S.saved.unshift({ id: 's' + Date.now().toString(36), name, filters, created: new Date().toISOString() }); emit('saved'); }
export function deleteSearch(id) { S.saved = S.saved.filter(s => s.id !== id); emit('saved'); }
export const pref = (k, d) => (S.prefs[k] ?? d);
export function setPref(k, v) { S.prefs[k] = v; emit('prefs'); }
export function setLastFilters(f) { S.filters = f; persist(); }
export const lastFilters = () => S.filters;

// ---- esporta / importa
export function exportData(author) {
  return {
    app: 'casone', kind: 'dati-personali', version: 1, exported: new Date().toISOString(), author: author || S.prefs.author || '',
    lists: S.lists, notes: S.notes, compare: S.compare, saved: S.saved,
  };
}
export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Il file non contiene dati di Casone.');
  if (obj.app !== 'casone') throw new Error('Questo file non è stato esportato da Casone.');
  if (!Array.isArray(obj.lists)) throw new Error('Nel file mancano le liste.');
  return obj;
}
// mode: 'replace' | 'merge' | 'separate'
export function importData(obj, mode, label) {
  validateImport(obj);
  const tag = (label || obj.author || 'importata').trim();
  if (mode === 'replace') {
    const b = blank();
    S = { ...b, prefs: S.prefs, lists: obj.lists.map(l => ({ ...l, ids: [...new Set(l.ids || [])] })), notes: obj.notes || {}, compare: obj.compare || [], saved: obj.saved || [] };
    if (!S.lists.find(l => l.id === 'fav')) S.lists.unshift(b.lists[0]);
  } else if (mode === 'merge') {
    for (const l of obj.lists) {
      const mine = S.lists.find(x => x.id === l.id) || S.lists.find(x => x.name.toLowerCase() === (l.name || '').toLowerCase());
      if (mine) mine.ids = [...new Set([...mine.ids, ...(l.ids || [])])];
      else S.lists.push({ ...l, ids: [...new Set(l.ids || [])] });
    }
    for (const [id, n] of Object.entries(obj.notes || {})) {
      const m = S.notes[id];
      if (!m) S.notes[id] = n;
      else S.notes[id] = { ...n, ...m, note: [m.note, n.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n— ') || undefined, updated: new Date().toISOString() };
    }
    S.compare = [...new Set([...S.compare, ...(obj.compare || [])])].slice(0, 6);
    const names = new Set(S.saved.map(s => s.name));
    for (const s of obj.saved || []) if (!names.has(s.name)) S.saved.push(s);
  } else {
    // come liste separate: ogni lista importata diventa "Nome (di Marco)"
    for (const l of obj.lists) {
      if (!(l.ids || []).length) continue;
      S.lists.push({ ...l, id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: `${l.name} (${tag})`, fixed: false, imported: { from: tag, at: new Date().toISOString() } });
    }
    for (const [id, n] of Object.entries(obj.notes || {})) {
      if (!n.note && !n.rating && !n.status) continue;
      const m = S.notes[id] || {};
      const extra = [n.rating ? '★'.repeat(n.rating) : '', n.note || '', n.status ? `(stato: ${(MYSTATUSL[n.status] || n.status).toLowerCase()})` : ''].filter(Boolean).join(' ');
      S.notes[id] = { ...m, note: [m.note, `${tag}: ${extra}`].filter(Boolean).join('\n'), updated: new Date().toISOString() };
    }
  }
  emit('all');
}
export function clearAll() { const p = S.prefs; S = blank(); S.prefs = p; emit('all'); }
