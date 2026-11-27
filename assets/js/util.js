// Piccole utilità condivise: DOM, formattazione, distanze.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const nf = new Intl.NumberFormat('it-IT');
export function fmtEuro(v) {
  if (v == null) return '';
  const r = Math.round(v * 100) / 100;
  return r.toLocaleString('it-IT', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
export const MON = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function monthsTxt(m) {
  if (!m || !m.length) return '';
  if (m.length === 12) return "tutto l'anno";
  const s = [...m].sort((a, b) => a - b), runs = [];
  let st = s[0], pv = s[0];
  for (const x of s.slice(1).concat([null])) {
    if (x === pv + 1) { pv = x; continue; }
    runs.push(st === pv ? MON[st - 1] : `${MON[st - 1]}–${MON[pv - 1]}`);
    st = pv = x;
  }
  return runs.join(', ');
}
export function hav(a, b, c, d) {
  const R = 6371, t = Math.PI / 180, x = (c - a) * t, y = (d - b) * t;
  const q = Math.sin(x / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
export function nightsBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return ''; return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', opts);
}
export function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}
let toastT;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) el.querySelector('button').onclick = () => { action.run(); el.classList.remove('on'); };
  el.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), action ? 6000 : 2800);
}
export function csv(rows) {
  const q = v => { v = v == null ? '' : String(v); return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
}
export function slugDate() { return todayISO(); }
export const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;
