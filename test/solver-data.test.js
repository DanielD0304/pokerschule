// Plausibilität der erzeugten Solver-Daten in data/ und der Preflop-Logik, die sie nutzt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeTables, pctOf, base64ToBytes } from '../src/core/preflop.js';
import { makeBots, evalSpot, lerp, REC_PUSH } from '../src/core/pushfold.js';
import { makeHU, fR } from '../src/core/hutree.js';
import { labelId, CMB } from '../src/core/cards.js';
import { selectFlops } from '../src/core/flops.js';
import { FIXED } from '../solver/paths.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../public/data/' + f, import.meta.url), 'utf8'));
const pf = read('pf-data.json'), huStrat = read('hu-strat.json'), huTree = read('hu-tree.json');
const flop = read('flop/index.json'), river = read('river-data.json');
const flopBoards = flop.boards.map(b => read('flop/' + b.board + '.json'));
const T = makeTables(pf);
const near1 = (a, eps = .011) => Math.abs(a.reduce((x, y) => x + y, 0) - 1) <= eps;

test('Base64-Dekodierung', () => {
  assert.deepEqual([...base64ToBytes('AAEC/w==')], [0, 1, 2, 255]);
});

test('Preflop-Equity ist symmetrisch und plausibel', () => {
  const e = (a, b) => T.EQ[labelId(a)][labelId(b)];
  assert.ok(Math.abs(e('AA', 'KK') - .82) < .01);
  assert.ok(Math.abs(e('AKs', 'QQ') - .46) < .015);
  assert.ok(Math.abs(e('KK', 'AA') + e('AA', 'KK') - 1) < 1e-9);
  assert.ok(T.HS[labelId('AA')] > .84 && T.HS[labelId('72o')] < .36);
  assert.ok(T.PCTL[labelId('AA')] < .01 && T.PCTL[labelId('32o')] > .99 && T.PCTL[labelId('72o')] > .95);
});

test('Push/Fold-Gleichgewicht bei 10 BB', () => {
  const push = pctOf(T.NASH[10].push), call = pctOf(T.NASH[10].call);
  assert.ok(push >= .55 && push <= .62, `SB pusht ${push}`);
  assert.ok(call >= .34 && call <= .40, `BB callt ${call}`);
  for (let S = 2; S <= 20; S++) {
    assert.equal(T.NASH[S].push[labelId('AA')], 1);
    assert.equal(T.NASH[S].call[labelId('AA')], 1);
  }
  assert.ok(pctOf(T.NASH[3].push) > pctOf(T.NASH[15].push), 'kürzere Stacks pushen breiter');
});

test('Push/Fold-Bots und EV-Rechnung', () => {
  const bots = makeBots(T);
  assert.ok(pctOf(bots.rec.push(10)) < pctOf(bots.nash.push(10)), 'Freizeitspieler pusht enger');
  assert.equal(lerp(1, REC_PUSH), .8); assert.equal(lerp(30, REC_PUSH), .13); assert.ok(Math.abs(lerp(9, REC_PUSH) - .31) < 1e-9);
  const aa = evalSpot(T, 'SB', 10, labelId('AA'), bots.nash);
  assert.ok(aa.ev.push > 2 && aa.ev.fold === -.5);
  const trash = evalSpot(T, 'SB', 10, labelId('72o'), bots.nash);
  assert.ok(trash.ev.push < trash.ev.fold, '72o pusht bei 10 BB gegen Nash nicht');
  const bb = evalSpot(T, 'BB', 10, labelId('32o'), bots.nash);
  assert.ok(bb.ev.call < bb.ev.fold && Math.abs(bb.need - .45) < 1e-9);
  const vsRec = evalSpot(T, 'SB', 10, labelId('84o'), bots.rec);
  assert.ok(vsRec.ev.push > vsRec.ev.fold, 'gegen den vorsichtigen Bot lohnt ein All-in mit 84o');
  const none = evalSpot(T, 'BB', 10, labelId('AA'), { push: () => new Array(169).fill(0) });
  assert.equal(none.eq, .5);
});

test('Heads-up 100 BB: Strategien und Erwartungswerte', () => {
  for (const [id, n] of Object.entries(huTree)) if (!n.t) {
    assert.equal(huStrat[id].length, 169);
    for (const row of huStrat[id]) assert.ok(near1(row), `${id} summiert sich zu 1`);
  }
  assert.ok(huStrat.root[labelId('AA')][1] > .99, 'AA eröffnet immer');
  assert.ok(huStrat.root[labelId('72o')][0] > .99, '72o foldet immer');
  assert.equal(huStrat.vsOpen[labelId('AA')][0], 0, 'AA foldet nie gegen einen Raise');
  const HU = makeHU(T, { tree: huTree, strat: huStrat });
  const ones = new Array(169).fill(1);
  const ev = HU.nodeEVs('root', 'SB', labelId('AA'), ones);
  assert.equal(ev[0], -.5); assert.ok(ev[1] > 4);
  const open = ones.map((_, o) => huStrat.root[o][1]);
  const kq = HU.nodeEVs('vsOpen', 'BB', labelId('KQo'), open);
  assert.ok(kq.every(Number.isFinite) && kq[0] === -1);
  assert.equal(fR(.5, .1), .6); assert.equal(fR(1, .1), 1);
  assert.equal(HU.paySB({ t: 'fold', sb: 1 }, 0, 0), 1);
});

test('Flop-Daten: 60 Boards nach Typ, Strategien, EV, Lösungsgüte', () => {
  // Index und Auswahl im Code stimmen überein (sonst: npm run solve:flop)
  const sel = selectFlops(60, FIXED);
  assert.deepEqual(flop.boards.map(b => [b.board, b.w, b.tags]), sel.map(b => [b.board, +b.w.toFixed(6), b.tags]));
  flop.boards.forEach((m, i) => { assert.equal(flopBoards[i].board, m.board); assert.equal(flopBoards[i].expl, m.expl); });
  for (const b of flopBoards) {
    assert.equal(typeof b.expl, 'number', `${b.board} hat einen Wert für die Lösungsgüte`);
    assert.ok(b.expl >= 0 && b.expl < .05, `${b.board}: ${b.expl} % Pot`);
    for (const [id, n] of Object.entries(flop.tree)) if (!n.t) {
      const side = n.p === 'SB' ? b.sb : b.bb, A = n.a.length;
      assert.equal(b.n[id].s.length, side.c.length * A);
      assert.ok(b.n[id].e.every(Number.isFinite));
      for (let h = 0; h < side.c.length; h += 37) {
        const row = b.n[id].s.slice(h * A, h * A + A).map(x => x / 100);
        assert.ok(near1(row, .03), `${b.board} ${id} Zeile ${h}`);
      }
    }
  }
});

test('River-Daten: 24 Spots, höchstens 0,1 % des Pots ausnutzbar', () => {
  assert.equal(river.spots.length, 24);
  for (const sp of river.spots) {
    assert.ok(sp.expl <= .1, `${sp.board}: ${sp.expl} % Pot`);
    assert.ok(sp.P > 0 && sp.board.length === 10);
    assert.ok(FIXED.includes(sp.board.slice(0, 6)), `${sp.board}: River-Spots stammen von den festen Flop-Boards`);
    for (const [id, n] of Object.entries(sp.tree)) if (!n.t) {
      const side = n.p === 'SB' ? sp.sb : sp.bb;
      assert.equal(sp.n[id].s.length, side.c.length * n.a.length);
      assert.ok(sp.n[id].e.every(Number.isFinite));
    }
  }
  assert.ok(CMB.length === 169);
});
