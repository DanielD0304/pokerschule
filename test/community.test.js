// Ranglisten, Wochen-Challenge, Spots und Abzeichen (Roadmap 03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeTables } from '../src/core/preflop.js';
import { makeHU } from '../src/core/hutree.js';
import * as S from '../src/core/spots.js';
import * as C from '../src/core/community.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../public/data/' + f, import.meta.url), 'utf8'));
const T = makeTables(read('pf-data.json'));
const flopIdx = read('flop/index.json');
const flop = { tree: flopIdx.tree, boards: flopIdx.boards.map(b => ({ ...read('flop/' + b.board + '.json'), w: b.w, tags: b.tags })) };
const ctx = { HU: makeHU(T, { tree: read('hu-tree.json'), strat: read('hu-strat.json') }), flop, river: read('river-data.json') };
/** Reproduzierbarer Zufall (Park-Miller). */
const seeded = (x = 7) => () => (x = (x * 16807) % 2147483647) / 2147483647;
const DAY = 86400000;

// ---------- Spots ----------

test('jede Situation lässt sich als Spot erzeugen, mit passender Position und Karten', () => {
  const rand = seeded(3);
  for (const key of S.SPOT_KEYS) {
    const s = S.makeSpot(ctx, key, rand);
    assert.ok(s, key);
    assert.equal(s.key, key);
    assert.ok(['SB', 'BB'].includes(s.pos));
    assert.equal(s.options.length, s.ev.length);
    assert.equal(s.acts.length, s.ev.length);
    assert.ok(Math.abs(s.mix.reduce((a, b) => a + b, 0) - 1) < .01, key + ' Strategie summiert auf 1');
    const cards = [...s.hero, ...s.board];
    assert.equal(new Set(cards).size, cards.length, key + ' keine Karte doppelt');
    assert.ok(cards.every(c => c >= 0 && c < 52));
    assert.equal(s.board.length, { duel: 0, flop: 3, river: 5 }[s.kind]);
    // die Linie endet beim Gegner, der Held ist am Zug
    if (s.line.length) assert.notEqual(s.line[s.line.length - 1].pos, s.pos);
    assert.ok(s.face && s.context && s.model);
  }
  assert.throws(() => S.makeSpot(ctx, 'flop:gibtsnicht'), /Unbekannte Situation/);
});

test('der Held hält nur Hände, mit denen er die Linie selbst so spielt', () => {
  // Small Blind gegen 4-Bet-All-in im Duell: Er hat eröffnet und 4-gebettet, also nie 72o
  const rand = seeded(11);
  for (let i = 0; i < 30; i++) {
    const s = S.makeSpot(ctx, 'duel:vsJam', rand), h = s.ref[0];
    assert.ok(ctx.HU.strat.root[h][1] > 0 && ctx.HU.strat.vs3b[h][2] > 0, 'Hand passt zur Linie');
  }
  const r = S.makeSpot(ctx, 'river:r_vsR75', seeded(5));
  assert.equal(r.line.map(l => l.a).join(','), 'check,b75,raise');
  assert.ok(r.pot > 12);
});

test('publicSpot verrät keine Lösung, answer bewertet', () => {
  const s = S.makeSpot(ctx, 'flop:f_vsB75', seeded(2)), p = S.publicSpot(s);
  assert.equal(p.ev, undefined); assert.equal(p.mix, undefined); assert.equal(p.ref, undefined);
  assert.deepEqual(p.options, s.options);
  const best = s.ev.indexOf(Math.max(...s.ev));
  assert.equal(S.answer(s, best).loss, 0);
  assert.ok(S.answer(s, best).correct);
  assert.throws(() => S.answer(s, 9), /Ungültige Antwort/);
  assert.throws(() => S.answer(s, 1.5), /Ungültige Antwort/);
});

test('Wochen-Spots: 20 Stück, gemischt, lehrreich, ohne Dubletten, reproduzierbar', () => {
  const a = S.weeklySpots(ctx, seeded(42)), b = S.weeklySpots(ctx, seeded(42));
  assert.equal(a.length, 20);
  assert.deepEqual(a.map(s => s.key), b.map(s => s.key));
  const kinds = a.reduce((o, s) => ({ ...o, [s.kind]: (o[s.kind] || 0) + 1 }), {});
  assert.deepEqual(kinds, S.WEEKLY_PLAN);
  assert.ok(a.every(s => S.spread(s) >= S.WEEKLY_MIN_SPREAD));
  assert.equal(new Set(a.map(s => s.key + s.ref.join())).size, 20);
  const per = a.reduce((o, s) => ({ ...o, [s.key]: (o[s.key] || 0) + 1 }), {});
  assert.ok(Object.values(per).every(n => n <= 2));
  assert.throws(() => S.weeklySpots(ctx, seeded(1), { duel: 11 }), /Zu wenige/);
});

test('Hilfen: Weg im Baum, gewichtete Auswahl, benötigte Daten', () => {
  assert.deepEqual(S.pathTo(ctx.HU.tree, 'root', 'vs3b'), [['root', 1], ['vsOpen', 2]]);
  assert.deepEqual(S.pathTo(ctx.HU.tree, 'root', 'root'), []);
  assert.equal(S.pathTo(ctx.HU.tree, 'root', 'nirgends'), null);
  assert.equal(S.pickWeighted([0, 0], Math.random), -1);
  assert.equal(S.pickWeighted([0, 5, 0], () => .99), 1);
  assert.equal(S.pickWeighted([1, 0], () => .9999999), 0);
  assert.deepEqual(S.dataNeeds(['river:r_ip']), ['river']);
  assert.deepEqual(S.dataNeeds(['duel:root', 'flop:f_ip']), ['pf', 'huTree', 'huStrat', 'flop']);
  assert.ok(S.isSpotKey('duel:vs4b')); assert.ok(!S.isSpotKey('quiz:x'));
});

// ---------- Ranglisten ----------

const now = Date.parse('2026-10-10T12:00:00Z');
const prof = (o = {}) => ({ display_name: 'Anna', is_public: true, active_at: new Date(now - DAY).toISOString(), rating: 1400, decisions: 500,
  ratings: { flop: 1300 }, counts: { flop: 250 }, online: { pf: { rating: 1100, games: 12 } }, ...o });

test('Wert je Rangliste und Gründe, nicht zu erscheinen', () => {
  assert.deepEqual(C.boardValue(prof(), 'overall'), { rating: 1400, n: 500 });
  assert.deepEqual(C.boardValue(prof(), 'flop'), { rating: 1300, n: 250 });
  assert.deepEqual(C.boardValue(prof({ counts: {} }), 'flop'), { rating: 1300, n: 0 });
  assert.equal(C.boardValue(prof(), 'river'), null);
  assert.deepEqual(C.boardValue(prof(), 'online_pf'), { rating: 1100, n: 12 });
  assert.equal(C.boardValue(prof(), 'online_duel'), null);
  assert.equal(C.boardValue(prof({ rating: null }), 'overall'), null);
  assert.throws(() => C.boardValue(prof(), 'poker'), /Unbekannte/);
  assert.equal(C.minFor('online_pf'), C.MIN_MATCHES); assert.equal(C.minFor('arena'), 200);

  assert.equal(C.absence(prof(), 'overall', now), null);
  assert.equal(C.absence(null, 'overall', now).why, 'account');
  assert.equal(C.absence(prof({ display_name: null }), 'overall', now).why, 'name');
  assert.equal(C.absence(prof({ is_public: false }), 'overall', now).why, 'private');
  assert.equal(C.absence(prof(), 'river', now).why, 'none');
  assert.deepEqual(C.absence(prof({ decisions: 150 }), 'overall', now), { why: 'few', missing: 50 });
  assert.equal(C.absence(prof({ active_at: new Date(now - 31 * DAY).toISOString() }), 'overall', now).why, 'inactive');
  assert.equal(C.absence(prof({ active_at: null }), 'overall', now).why, 'inactive');
});

test('Sortierung: Rating, dann Entscheidungen; Zuwachs; Referenzspieler ohne Platz', () => {
  const r = C.rank([{ name: 'b', rating: 1200, n: 300 }, { name: 'a', rating: 1200, n: 300 }, { name: 'c', rating: 1200, n: 900 }, { name: 'd', rating: 1500, n: 200 }]);
  assert.deepEqual(r.map(x => x.name + x.pos), ['d1', 'c2', 'a3', 'b4']);
  const g = C.rank([{ name: 'x', rating: 1000, n: 1, gain: 50 }, { name: 'y', rating: 2000, n: 1, gain: 10 }], 'gain');
  assert.deepEqual(g.map(x => x.name), ['x', 'y']);
  const w = C.withReference([{ name: 'Anna', rating: 1460, pos: 1 }], [{ name: 'Einsteiger', rating: 1000, note: '' }, { name: 'Fortgeschritten', rating: 1460, note: '' }]);
  assert.deepEqual(w.map(x => x.name), ['Anna', 'Fortgeschritten', 'Einsteiger']);
  assert.equal(w[1].pos, null); assert.equal(w[1].ref, true); assert.equal(w[0].ref, false);
});

test('Woche ab Montag 0 Uhr deutscher Zeit, ISO-Kalenderwoche, Sommerzeit, Monat', () => {
  const w = C.weekOf(Date.parse('2026-10-09T21:30:00Z'));
  assert.equal(w.key, '2026-W41');
  assert.equal(new Date(w.start).toISOString(), '2026-10-04T22:00:00.000Z'); // Montag 0 Uhr MESZ
  assert.equal(new Date(w.end).toISOString(), '2026-10-11T22:00:00.000Z');
  assert.equal(C.weekOf(Date.parse('2026-10-11T22:30:00Z')).key, '2026-W42'); // Montag 0:30 deutscher Zeit
  assert.equal(C.weekOf(Date.parse('2026-10-11T21:59:59Z')).key, '2026-W41');
  const winter = C.weekOf(Date.parse('2026-10-28T12:00:00Z'));
  assert.equal(new Date(winter.start).toISOString(), '2026-10-25T23:00:00.000Z'); // nach der Zeitumstellung
  assert.equal(C.weekOf(Date.parse('2027-01-01T12:00:00Z')).key, '2026-W53');
  assert.equal(C.weekOf(Date.parse('2021-01-03T10:00:00Z')).key, '2020-W53');
  for (const k of ['2026-W41', '2026-W53', '2020-W53', '2027-W01']) assert.equal(C.weekFromKey(k).key, k);
  assert.equal(C.weekFromKey('2026-W54'), null);
  assert.equal(C.weekFromKey('quatsch'), null);
  assert.equal(C.weekNumber('2026-W07'), 7);
  const m = C.monthOf(Date.parse('2026-10-31T23:30:00Z'));
  assert.equal(m.key, '2026-11');
  assert.equal(new Date(m.start).toISOString(), '2026-10-31T23:00:00.000Z');
  assert.equal(new Date(C.berlinMidnight(2026, 7, 1)).toISOString(), '2026-06-30T22:00:00.000Z');
});

// ---------- Wochen-Challenge ----------

const spots = [
  { options: ['Fold', 'Call'], ev: [0, 1] },
  { options: ['Fold', 'Call', 'Raise'], ev: [-1, 0, .5] },
];

test('Wertung einer Abgabe: EV-Verlust im Schnitt, Zeit, richtige Antworten', () => {
  const r = C.scoreEntry(spots, [{ c: 1, ms: 4000 }, { c: 0, ms: 6000 }]);
  assert.equal(r.loss, .75); assert.equal(r.ms, 10000); assert.equal(r.good, 1);
  assert.deepEqual(r.items.map(x => [x.q, x.best]), [['best', 1], ['blun', 2]]);
  assert.throws(() => C.scoreEntry(spots, [{ c: 1, ms: 1 }]), /Nicht alle/);
});

test('Reihenfolge der Challenge: weniger Verlust, dann schneller', () => {
  const r = C.rankEntries([{ id: 'a', loss: .2, ms: 9 }, { id: 'b', loss: .1, ms: 50 }, { id: 'c', loss: .2, ms: 5 }]);
  assert.deepEqual(r.map(e => e.id + e.pos), ['b1', 'c2', 'a3']);
});

test('Verteilung der Antworten je Spot, kaputte Einträge zählen nicht', () => {
  const d = C.distribution(spots, [[{ c: 1 }, { c: 2 }], [{ c: 1 }, { c: 0 }], [{ c: 0 }], null, [{ c: 7 }, { c: 'x' }]]);
  assert.deepEqual(d[0], { n: 3, share: [1 / 3, 2 / 3] });
  assert.deepEqual(d[1], { n: 2, share: [.5, 0, .5] });
  assert.deepEqual(C.distribution(spots, [])[0], { n: 0, share: [0, 0] });
});

// ---------- Freunde und Abzeichen ----------

test('Vergleich mit einem Freund je Situation', () => {
  const r = C.compareSpots([
    { spot: 'flop:f_ip', my_n: 10, my_loss: 1, their_n: 10, their_loss: 3 },
    { spot: 'river:r_vs75', my_n: 20, my_loss: 10, their_n: 5, their_loss: 1 },
    { spot: 'duel:root', my_n: 2, my_loss: 0, their_n: 0, their_loss: 0 },
    { spot: 'duel:vsOpen', my_n: 8, my_loss: .8, their_n: 8, their_loss: .82 },
  ]);
  assert.deepEqual(r.map(x => [x.spot, x.better]), [['river:r_vs75', 'them'], ['flop:f_ip', 'me'], ['duel:vsOpen', null], ['duel:root', null]]);
  assert.equal(r[1].mine, .1); assert.equal(r[1].theirs, .3);
  assert.equal(r[3].theirs, null); assert.equal(r[3].enough, false);
});

test('Abzeichen aus dem Profil', () => {
  const ids = p => C.badgesOf(p).filter(b => b.earned).map(b => b.id);
  assert.deepEqual(ids(null), []);
  assert.deepEqual(ids({ decisions: 120 }), ['d100']);
  assert.deepEqual(ids({ decisions: 1200, rating: 1500, counts: { arena: 50, duel: 60, flop: 70, river: 80 } }), ['d100', 'd1000', 'adv', 'allround']);
  assert.deepEqual(ids({ decisions: 150, rating: 1800 }), ['d100']); // Rating zählt erst ab 200 Entscheidungen
  assert.deepEqual(ids({ online: { pf: { games: 10 } }, weekly: { played: 10, best: 3 } }), ['online', 'week1', 'week10', 'podium']);
  assert.equal(C.badgesOf({}).length, C.BADGES.length);
});
