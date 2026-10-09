// Der eine Speicherstand der App (Schema v2). Änderungen werden an die Oberfläche gemeldet.
import { load, save, defaults } from '../core/storage.js';

function browserStorage() {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch { /* privat, blockiert */ }
  const m = new Map(); // Fallback: nur für diese Sitzung
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
const storage = browserStorage();
export const state = load(storage);

const listeners = new Set();
let version = 0;
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getVersion = () => version;
/** Meldet eine Änderung an alle Abonnenten (React liest dann neu). */
export function renderHeader() { version++; listeners.forEach(fn => fn()); }
export function persist() { const ok = save(storage, state); renderHeader(); return ok; }

/** Setzt allen Fortschritt zurück, behält aber die Bestätigung des Altershinweises. */
export function resetAll() {
  const d = defaults(), ageOk = state.ui.ageOk;
  for (const k of Object.keys(d)) state[k] = d[k];
  state.ui.ageOk = ageOk;
  persist();
}
/** Ersetzt den kompletten Stand (Import). */
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  persist();
}
