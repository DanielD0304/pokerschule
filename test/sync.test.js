import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, same, summary, isEmpty, publicStats, nameError, enqueue } from '../src/core/sync.js';
import { defaults } from '../src/core/storage.js';

const withMode = (s, k, accN, rating = 1000, n = accN) => { s[k] = { ...s[k], accN, accSum: accN * 90, n, rating, hands: accN }; return s; };
const mistake = (made, spot, box = 0, extra = {}) => ({ id: 1, spot, made, box, last: 0, seen: 0, orig: 0, q: 'mist', ...extra });

test('summary zählt Entscheidungen, Hände und offene Fehler', () => {
  const s = withMode(defaults(), 'flop', 300);
  s.quiz.show.t = 12; s.review.items = [mistake(1, 'flop:f_ip'), mistake(2, 'river:r_ip')];
  assert.deepEqual(summary(s), { decisions: 312, hands: 300, mistakes: 2 });
  assert.equal(isEmpty(defaults()), true);
  assert.equal(isEmpty(s), false);
  assert.equal(isEmpty({}), true, 'unvollständige Stände werden aufgefüllt');
});

test('pro Bereich gewinnt der Stand mit mehr Entscheidungen', () => {
  const a = withMode(withMode(defaults(), 'flop', 50, 1200), 'river', 3, 900);
  const b = withMode(withMode(defaults(), 'flop', 20, 1100), 'river', 40, 1300);
  a.quiz.pre = { c: 5, t: 9 }; b.quiz.pre = { c: 1, t: 2 };
  const m = merge(a, b);
  assert.equal(m.flop.rating, 1200); assert.equal(m.river.rating, 1300);
  assert.equal(m.quiz.pre.t, 9);
  assert.deepEqual(a.flop.accN, 50, 'Eingaben bleiben unverändert');
});

test('Gleichstand: der lokale Stand gewinnt; Arena-Match folgt dem Arena-Stand', () => {
  const a = withMode(defaults(), 'arena', 5, 1010), b = withMode(defaults(), 'arena', 5, 990);
  assert.equal(merge(a, b).arena.rating, 1010);
  b.arena.accN = 6; b.match = { me: 10, bot: 20 }; a.match = { me: 15, bot: 15 };
  assert.deepEqual(merge(a, b).match, { me: 10, bot: 20 });
  assert.deepEqual(merge(b, a).match, { me: 10, bot: 20 });
});

test('Fehlerlisten werden vereinigt, Duplikate einmal mit dem besseren Lernstand', () => {
  const a = defaults(), b = defaults();
  a.review = { items: [mistake(100, 'flop:f_ip', 1), mistake(200, 'duel:root')], mastered: 3, seq: 2, today: '2026-10-09' };
  b.review = { items: [mistake(100, 'flop:f_ip', 2, { id: 7 }), mistake(150, 'river:r_vs75')], mastered: 5, seq: 9, today: null };
  const r = merge(a, b).review;
  assert.deepEqual(r.items.map(i => [i.made, i.box]), [[100, 2], [150, 0], [200, 0]]);
  assert.deepEqual(r.items.map(i => i.id), [1, 2, 3], 'ids werden neu vergeben');
  assert.equal(r.seq, 3); assert.equal(r.mastered, 5); assert.equal(r.today, '2026-10-09');
  // gleicher Kasten: der zuletzt geübte zählt
  a.review.items = [mistake(100, 'x', 1, { last: 5 })]; b.review.items = [mistake(100, 'x', 1, { last: 9 })];
  assert.equal(merge(a, b).review.items[0].last, 9);
});

test('Fehlerliste bleibt auf 200 begrenzt, gemeisterte fallen zuerst weg', () => {
  const a = defaults(), b = defaults();
  a.review.items = Array.from({ length: 150 }, (_, i) => mistake(i, 'a', i < 10 ? 2 : 0));
  b.review.items = Array.from({ length: 100 }, (_, i) => mistake(1000 + i, 'b'));
  const items = merge(a, b).review.items;
  assert.equal(items.length, 200);
  assert.equal(items.filter(i => i.box === 2).length, 0);
  assert.ok(items.every((it, i) => !i || items[i - 1].made <= it.made), 'nach Entstehung sortiert');
});

test('Statistik je Situation und Tag: höhere Anzahl gewinnt, beide Seiten bleiben erhalten', () => {
  const a = defaults(), b = defaults();
  a.dash = { spots: { 'flop:f_ip': { n: 5, wrong: 1, loss: 1 }, 'duel:root': { n: 2, wrong: 0, loss: 0 } }, days: { '2026-10-08': { n: 4, ok: 3 } } };
  b.dash = { spots: { 'flop:f_ip': { n: 9, wrong: 4, loss: 3 } }, days: { '2026-10-08': { n: 2, ok: 2 }, '2026-10-09': { n: 7, ok: 5 } } };
  const d = merge(a, b).dash;
  assert.equal(d.spots['flop:f_ip'].n, 9); assert.equal(d.spots['duel:root'].n, 2);
  assert.equal(d.days['2026-10-08'].n, 4); assert.equal(d.days['2026-10-09'].n, 7);
});

test('neuere Epoche (Zurücksetzen, Import) gewinnt ganz', () => {
  const old = withMode(defaults(), 'flop', 500), fresh = defaults();
  fresh.sync.epoch = 1760000000000;
  assert.equal(merge(old, fresh).flop.accN, 0);
  assert.equal(merge(fresh, old).flop.accN, 0);
});

test('Altershinweis bleibt bestätigt; merge ist idempotent', () => {
  const a = defaults(), b = withMode(defaults(), 'duel', 4);
  b.ui.ageOk = true; a.ui.tab = 'flop';
  const m = merge(a, b);
  assert.equal(m.ui.ageOk, true); assert.equal(m.ui.tab, 'flop');
  assert.ok(same(merge(m, b), m));
  assert.ok(same(merge(m, m), m));
  assert.ok(!same(m, a));
});

test('öffentliche Kennzahlen: nur gespielte Modi, gewichtetes Gesamt-Rating', () => {
  assert.deepEqual(publicStats(defaults()), { ratings: {}, counts: {}, overall: null, decisions: 0 });
  const s = withMode(withMode(defaults(), 'flop', 30, 1200, 30), 'river', 10, 1000, 10);
  assert.deepEqual(publicStats(s), { ratings: { flop: 1200, river: 1000 }, counts: { flop: 30, river: 10 }, overall: 1150, decisions: 40 });
});

test('Anzeigenamen werden geprüft', () => {
  assert.equal(nameError('Jürgen_K'), null);
  assert.equal(nameError('  ace.high  '), null);
  assert.match(nameError('ab'), /mindestens 3/);
  assert.match(nameError('x'.repeat(25)), /höchstens 24/);
  assert.match(nameError('zwei Worte'), /keine Leerzeichen/);
  assert.match(nameError('<script>'), /Erlaubt/);
  assert.match(nameError(undefined), /mindestens 3/);
});

test('Warteschlange für Entscheidungen ist begrenzt', () => {
  let box = [];
  for (let i = 0; i < 5; i++) box = enqueue(box, { id: i }, 3);
  assert.deepEqual(box.map(r => r.id), [2, 3, 4]);
});
