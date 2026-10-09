// Versionierter Speicherstand: ein Schlüssel, ein Objekt, Migration der alten v1-Schlüssel, Export und Import.
import { START_RATING } from './rating.js';

export const VERSION = 2;
export const KEY = 'pokerschule';
export const V1_KEYS = {
  quiz: 'pokerschule.stats.v1', arena: 'pokerschule.arena.v1', match: 'pokerschule.arena.match',
  duel: 'pokerschule.duel.v1', flop: 'pokerschule.flop.v1', river: 'pokerschule.river.v1',
  dash: 'pokerschule.dash.v1', review: 'pokerschule.review.v1', tab: 'pokerschule.tab',
};

export const modeState = () => ({ rating: START_RATING, n: 0, hist: [START_RATING], accSum: 0, accN: 0, cls: {}, ev: 0, hands: 0, log: [] });
export function defaults() {
  return {
    version: VERSION,
    quiz: { show: { c: 0, t: 0 }, pre: { c: 0, t: 0 }, odds: { c: 0, t: 0 }, streak: 0, best: 0 },
    arena: { ...modeState(), real: 0, m: 0, mw: 0 },
    match: null,
    duel: modeState(), flop: modeState(), river: modeState(),
    dash: { spots: {}, days: {} },
    review: { items: [], mastered: 0, seq: 0, today: null },
    ui: { tab: null, ageOk: false },
  };
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Füllt fehlende Felder aus den Standardwerten auf (eine Ebene tief je Abschnitt). */
export function normalize(raw) {
  const d = defaults(), out = { ...d };
  for (const k of Object.keys(d)) {
    if (k === 'version') continue;
    const v = raw?.[k];
    if (k === 'match') { out.match = isObj(v) && v.me > 0 && v.bot > 0 ? v : null; continue; }
    if (isObj(v)) out[k] = { ...d[k], ...v };
  }
  out.version = VERSION;
  return out;
}

/** Liest die v1-Schlüssel. get(key) liefert einen String oder null. Ergebnis null, wenn nichts da ist. */
export function migrateV1(get) {
  const read = key => { try { const s = get(key); return s == null ? undefined : JSON.parse(s); } catch { return undefined; } };
  const found = {};
  for (const [k, key] of Object.entries(V1_KEYS)) {
    if (k === 'tab') { const t = get(key); if (t) found.ui = { tab: t }; continue; }
    const v = read(key); if (v !== undefined) found[k] = v;
  }
  if (!Object.keys(found).length) return null;
  return normalize(found);
}

/** Migrationen ab v2: migrations[n] macht aus Version n die Version n+1. */
export const migrations = {};
function upgrade(obj) {
  let o = obj, v = o.version;
  while (v < VERSION) { const m = migrations[v]; if (!m) throw new Error(`Keine Migration von Version ${v}`); o = m(o); v = o.version; }
  return o;
}

/** Lädt den Stand aus einem Storage-Objekt (localStorage-ähnlich). Migriert v1 einmalig. */
export function load(storage) {
  let raw = null;
  try { raw = storage.getItem(KEY); } catch { /* Speicher nicht verfügbar */ }
  if (raw) {
    try { const o = JSON.parse(raw); if (isObj(o) && typeof o.version === 'number') return normalize(upgrade(o)); } catch { /* kaputt → neu */ }
  }
  let migrated = null;
  try { migrated = migrateV1(k => storage.getItem(k)); } catch { /* ignorieren */ }
  const state = migrated || defaults();
  if (migrated && save(storage, state)) {
    for (const key of Object.values(V1_KEYS)) { try { storage.removeItem(key); } catch { /* egal */ } }
  }
  return state;
}
export function save(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function exportState(state, now = new Date()) {
  return JSON.stringify({ app: 'pokerschule', version: VERSION, exported: now.toISOString(), data: state }, null, 1);
}
/** Prüft eine Exportdatei und liefert den Stand. Wirft Error mit verständlicher Meldung. */
export function importState(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (!isObj(o) || o.app !== 'pokerschule' || !isObj(o.data)) throw new Error('Das ist keine Fortschrittsdatei der Pokerschule.');
  if (typeof o.version !== 'number' || o.version > VERSION) throw new Error('Die Datei stammt aus einer neueren Version der Pokerschule.');
  const data = { ...o.data, version: o.data.version ?? o.version };
  return normalize(upgrade(data));
}
export const exportFileName = (now = new Date()) =>
  `pokerschule-fortschritt-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
