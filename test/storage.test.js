import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, save, defaults, normalize, migrateV1, exportState, importState, exportFileName, KEY, V1_KEYS, VERSION } from '../src/core/storage.js';

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

const V1 = {
  [V1_KEYS.quiz]: JSON.stringify({ show: { c: 3, t: 4 }, pre: { c: 1, t: 2 }, odds: { c: 0, t: 1 }, streak: 1, best: 3 }),
  [V1_KEYS.arena]: JSON.stringify({ rating: 1111, n: 5, hist: [1000, 1111], accSum: 400, accN: 5, cls: { best: 3 }, real: 2, ev: 1.5, hands: 9, log: [] }),
  [V1_KEYS.match]: JSON.stringify({ start: 15, style: 'rec', me: 12, bot: 18, n: 4, sbMe: true }),
  [V1_KEYS.duel]: JSON.stringify({ rating: 950, n: 2, hist: [1000, 950], accSum: 150, accN: 2, cls: {}, ev: -3, hands: 2, log: [] }),
  [V1_KEYS.flop]: JSON.stringify({ rating: 1020, n: 1, hist: [1000], accSum: 100, accN: 1, cls: {}, ev: 0, hands: 1, log: [] }),
  [V1_KEYS.dash]: JSON.stringify({ spots: { 'flop:f_ip': { n: 3, wrong: 1, loss: .4 } }, days: { '2026-10-08': { n: 7, ok: 5 } } }),
  [V1_KEYS.review]: JSON.stringify({ items: [{ id: 1, spot: 'flop:f_ip', box: 1 }], mastered: 2, seq: 1 }),
  [V1_KEYS.tab]: 'arena',
};

test('Migration v1 → v2 übernimmt alles und räumt die alten Schlüssel auf', () => {
  const st = memStorage(V1);
  const s = load(st);
  assert.equal(s.version, VERSION);
  assert.equal(s.arena.rating, 1111); assert.equal(s.arena.m, 0, 'fehlende Felder werden ergänzt');
  assert.equal(s.match.me, 12); assert.equal(s.duel.ev, -3); assert.equal(s.flop.rating, 1020);
  assert.equal(s.river.rating, 1000, 'nicht vorhandener Modus → Standardwerte');
  assert.equal(s.quiz.show.c, 3); assert.equal(s.dash.days['2026-10-08'].n, 7);
  assert.equal(s.review.mastered, 2); assert.equal(s.ui.tab, 'arena'); assert.equal(s.ui.ageOk, false);
  for (const k of Object.values(V1_KEYS)) assert.equal(st.getItem(k), null);
  assert.ok(st.getItem(KEY));
  assert.deepEqual(load(st), s, 'zweites Laden liest den v2-Stand');
});

test('ohne Daten → Standardwerte; kaputte Daten → Standardwerte', () => {
  assert.deepEqual(load(memStorage()), defaults());
  assert.deepEqual(load(memStorage({ [KEY]: '{kaputt' })), defaults());
  assert.equal(migrateV1(() => null), null);
  const broken = migrateV1(k => k === V1_KEYS.arena ? '{x' : k === V1_KEYS.duel ? JSON.stringify({ rating: 900 }) : null);
  assert.equal(broken.duel.rating, 900); assert.equal(broken.arena.rating, 1000);
});

test('Speicher nicht verfügbar → kein Absturz', () => {
  const bad = { getItem() { throw new Error('blockiert'); }, setItem() { throw new Error('voll'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(load(bad), defaults());
  assert.equal(save(bad, defaults()), false);
});

test('normalize: ungültiges Match wird verworfen', () => {
  assert.equal(normalize({ match: { me: 0, bot: 5 } }).match, null);
  assert.equal(normalize({ match: [1, 2] }).match, null);
  assert.equal(normalize({ arena: 'x' }).arena.rating, 1000);
});

test('Export → Import stellt den Stand vollständig wieder her', () => {
  const s = load(memStorage(V1));
  s.river.rating = 1234; s.ui.ageOk = true;
  const text = exportState(s, new Date('2026-10-08T12:00:00Z'));
  assert.deepEqual(importState(text), s);
  assert.equal(exportFileName(new Date(2026, 9, 8)), 'pokerschule-fortschritt-2026-10-08.json');
});

test('Import lehnt fremde oder kaputte Dateien ab', () => {
  assert.throws(() => importState('nicht json'), /kein gültiges JSON/);
  assert.throws(() => importState(JSON.stringify({ app: 'anders', data: {} })), /keine Fortschrittsdatei/);
  assert.throws(() => importState(JSON.stringify({ app: 'pokerschule', version: 99, data: {} })), /neueren Version/);
  assert.throws(() => importState(JSON.stringify({ app: 'pokerschule', version: 2, data: 5 })), /keine Fortschrittsdatei/);
  assert.throws(() => importState(JSON.stringify({ app: 'pokerschule', version: 1, data: { version: 1 } })), /Keine Migration/);
});
