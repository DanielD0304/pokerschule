// Der eine Speicherstand der App (Schema v2) und die Kopfzeile mit den Kennzahlen.
import { load, save, defaults } from '../core/storage.js';

function browserStorage() {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch { /* privat, blockiert */ }
  const m = new Map(); // Fallback: nur für diese Sitzung
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const storage = browserStorage();
export const state = load(storage);
export const persist = () => save(storage, state);

const resetHandlers = [];
export const onReset = fn => resetHandlers.push(fn);
/** Setzt alles auf Anfang, behält aber die Bestätigung des Altershinweises. */
export function resetAll() {
  const d = defaults(), ageOk = state.ui.ageOk;
  for (const k of Object.keys(d)) state[k] = d[k];
  state.ui.ageOk = ageOk;
  persist();
  resetHandlers.forEach(fn => fn());
}
/** Ersetzt den kompletten Stand (Import). */
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  persist();
}

export function renderHeader() {
  const q = state.quiz, f = o => o.t ? `<b>${Math.round(o.c / o.t * 100)}%</b> ${o.c}/${o.t}` : '–';
  const r = (label, ms) => `<span class="chip">${label} <b>${Math.round(ms.rating)}</b></span>`;
  document.getElementById('stats').innerHTML =
    `<span class="chip">Showdown ${f(q.show)}</span><span class="chip">Preflop ${f(q.pre)}</span><span class="chip">Pot Odds ${f(q.odds)}</span>` +
    `<span class="chip">Serie <b>${q.streak}</b> · Rekord ${q.best}</span>` +
    r('Arena-Rating', state.arena) + r('Duell-Rating', state.duel) + r('Flop-Rating', state.flop) + r('River-Rating', state.river);
}
