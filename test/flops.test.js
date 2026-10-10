// Flop-Boards nach Typ: Einordnung, Farbvertauschung, Auswahl der 60 Boards (Roadmap 04, B-01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/core/flops.js';
import { FIXED } from '../solver/paths.js';

const tags = s => F.boardTags(s).sort();

test('Board lesen und schreiben', () => {
  assert.deepEqual(F.parseBoard('As7d2c'), [{ r: 12, s: 0 }, { r: 5, s: 2 }, { r: 0, s: 3 }]);
  assert.equal(F.boardStr(F.parseBoard('Tc5c2c')), 'Tc5c2c');
  assert.throws(() => F.parseBoard('As7d'), /Ungültiges/);
  assert.throws(() => F.parseBoard('AsAs2c'), /doppelt/);
  assert.throws(() => F.parseBoard('1s7d2c'), /Ungültiges/);
});

test('Board-Typen', () => {
  assert.deepEqual(tags('As7d2c'), ['ace', 'dry']);
  assert.deepEqual(tags('Jh9h8c'), ['wet']);
  assert.deepEqual(tags('Jh9c8d'), []);                 // verbunden, aber drei Farben: weder trocken noch nass
  assert.deepEqual(tags('8d8s3c'), ['low', 'paired']);
  assert.deepEqual(tags('8s8h8d'), ['low', 'paired']);
  assert.deepEqual(tags('9d9s3c'), ['paired']);
  assert.deepEqual(tags('Tc5c2c'), ['mono']);
  assert.deepEqual(tags('AhKdQs'), ['ace', 'broadway']); // AKQ: Straße möglich, also nicht trocken
  assert.deepEqual(tags('7h6h5c'), ['low', 'wet']);
  assert.deepEqual(tags('Ad5s4h'), ['ace']);             // Rad-Straße möglich (A-2-3-4-5)
  assert.deepEqual(tags('Kc8h3s'), ['dry']);
  assert.deepEqual(tags('8s4d2h'), ['dry', 'low']);      // 8-4-2: kein Fenster von fünf Rängen enthält alle drei
  assert.deepEqual(tags('6s5d2h'), ['low']);             // 6-5-2: Straße mit 4-3 möglich
  const t = F.texture(F.parseBoard('KhKs5d'));
  assert.deepEqual([t.paired, t.suits, t.hi, t.straight], [1, 'rainbow', 11, false]);
  for (const k of Object.keys(F.TAGS)) assert.ok(F.TAGS[k].name && F.TAGS[k].text);
});

test('1755 strategisch verschiedene Flops, zusammen alle 22 100', () => {
  const cls = F.flopClasses();
  assert.equal(cls.length, 1755);
  assert.equal(cls.reduce((a, c) => a + c.w, 0), F.ALL_FLOPS);
  assert.equal(F.flopClasses(), cls, 'zwischengespeichert');
  // Farbvertauschung ändert nichts, Ränge schon
  assert.equal(F.canonical(F.parseBoard('As7d2c')), F.canonical(F.parseBoard('Ah7c2s')));
  assert.equal(F.canonical(F.parseBoard('Qh9h4c')), F.canonical(F.parseBoard('Qs9s4d')));
  assert.notEqual(F.canonical(F.parseBoard('Qh9h4c')), F.canonical(F.parseBoard('Qh9c4h')), 'welche Karten die Farbe teilen, zählt');
  const w = s => cls.find(c => c.key === F.canonical(F.parseBoard(s))).w;
  assert.equal(w('As7d2c'), 24); assert.equal(w('Tc5c2c'), 4); assert.equal(w('Qh9h4c'), 12); assert.equal(w('8s8h8d'), 4); assert.equal(w('8d8s3c'), 12);
});

test('Plätze je Typ: proportional, mit Mindestzahl', () => {
  assert.deepEqual(F.allocate(10, { a: 70, b: 25, c: 5 }, {}), { a: 7, b: 2, c: 1 });
  assert.deepEqual(F.allocate(10, { a: 70, b: 25, c: 5 }, { c: 3 }), { a: 6, b: 1, c: 3 });
  assert.throws(() => F.allocate(2, { a: 1, b: 1, c: 1 }, {}), /Zu wenige/);
});

test('60 Boards: feste zuerst, keine Dublette, vertreten zusammen alle Flops', () => {
  const sel = F.selectFlops(60, FIXED);
  assert.equal(sel.length, 60);
  assert.deepEqual(sel.slice(0, 12).map(b => b.board), FIXED);
  assert.equal(new Set(sel.map(b => F.canonical(F.parseBoard(b.board)))).size, 60);
  assert.ok(Math.abs(sel.reduce((a, b) => a + b.w, 0) - 1) < 1e-9);
  assert.ok(sel.every(b => b.w > 0));
  assert.deepEqual(F.selectFlops(60, FIXED), sel, 'reproduzierbar');
  // jeder Typ hat genug Boards für den Filter, und die Anteile entsprechen grob der Wirklichkeit
  const cls = F.flopClasses();
  for (const t of Object.keys(F.TAGS)) {
    const mine = sel.filter(b => b.tags.includes(t)), share = mine.reduce((a, b) => a + b.w, 0);
    const real = cls.filter(c => F.boardTags(F.boardStr(c.cards)).includes(t)).reduce((a, c) => a + c.w, 0) / F.ALL_FLOPS;
    assert.ok(mine.length >= 4, `${t}: ${mine.length} Boards`);
    assert.ok(Math.abs(share - real) < .05, `${t}: ${share.toFixed(3)} statt ${real.toFixed(3)}`);
  }
  assert.throws(() => F.selectFlops(60, ['8s8h8d', '7s7h7d']), /Mehr feste Boards/);
});

test('Board ziehen nach Häufigkeit und Typ', () => {
  const boards = [{ board: 'a', w: .9, tags: ['dry'] }, { board: 'b', w: .1, tags: ['wet'] }];
  assert.equal(F.pickBoard(boards, () => .5).board, 'a');
  assert.equal(F.pickBoard(boards, () => .95).board, 'b');
  assert.equal(F.pickBoard(boards, () => .5, 'wet').board, 'b');
  assert.equal(F.pickBoard(boards, () => .9999999999).board, 'b');
  assert.throws(() => F.pickBoard(boards, Math.random, 'mono'), /Kein Board/);
});
