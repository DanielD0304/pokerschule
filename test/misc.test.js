import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand, combos, pct, cellLabel } from '../src/core/ranges.js';
import { requiredEquity, equityOneCard, equityTwoCards, ruleOfThumb, makeScenario, DRAWS } from '../src/core/potodds.js';
import { exactEq, mcEq } from '../src/core/equity.js';
import { parse, cint, deck, labelOf, idLabel, labelId, cid, classOfInts, combosOf, compatMatrix, cardStr, cardFromStr, icard } from '../src/core/cards.js';

function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }

test('Ranges: Notation, Combos, Prozent', () => {
  const s = expand('22+,A2s+,KTs+,AJo+,KQo');
  assert.equal(s.size, 13 + 12 + 3 + 3 + 1);
  assert.ok(s.has('AKs') && s.has('KJs') && !s.has('K9s') && s.has('AQo') && !s.has('ATo'));
  assert.deepEqual([...expand('JTs, 55')].sort(), ['55', 'JTs']);
  assert.equal(combos('AA'), 6); assert.equal(combos('AKs'), 4); assert.equal(combos('AKo'), 12);
  assert.equal(pct(expand('AA,KK')), 0.9);
  assert.throws(() => expand('ZZ'), /Unbekannte Hand/);
  assert.throws(() => expand('AK'), /Paar erwartet/);
  assert.equal(cellLabel(12, 12), 'AA'); assert.equal(cellLabel(12, 11), 'AKs'); assert.equal(cellLabel(11, 12), 'AKo');
});

test('Karten und Klassen', () => {
  const d = deck(rng(1)); assert.equal(d.length, 52); assert.equal(new Set(d.map(cint)).size, 52);
  assert.equal(labelOf(...parse('Kh Ah')), 'AKs'); assert.equal(labelOf(...parse('7d 2c')), '72o'); assert.equal(labelOf(...parse('9s 9d')), '99');
  for (let id = 0; id < 169; id++) assert.equal(labelId(idLabel(id)), id);
  assert.equal(cid(parse('As Kd')), labelId('AKo'));
  assert.equal(classOfInts(cardFromStr('Ah'), cardFromStr('Kh')), labelId('AKs'));
  assert.equal(combosOf(labelId('AA')).length, 6); assert.equal(combosOf(labelId('AKs')).length, 4); assert.equal(combosOf(labelId('AKo')).length, 12);
  assert.equal(cardStr(cardFromStr('Td')), 'Td'); assert.deepEqual(icard(cardFromStr('Qc')), { r: 12, s: 3 });
  const C = compatMatrix(); const aa = labelId('AA');
  assert.equal(C[aa][aa], 1, 'bei AA bleibt genau eine AA-Combo übrig');
  assert.equal(C[labelId('72o')][labelId('KQo')], 12);
});

test('Pot Odds: Formeln und Szenarien', () => {
  assert.equal(requiredEquity(10, 5), .25);
  assert.equal(equityOneCard(9), 9 / 46);
  assert.ok(Math.abs(equityTwoCards(9) - .3497) < 1e-3, 'Flush-Draw vom Flop bis zum River ≈ 35 %');
  assert.ok(Math.abs(equityTwoCards(8) - .3145) < 1e-3, 'Open-Ender ≈ 31,5 %');
  assert.equal(ruleOfThumb(9, 'flop'), .36); assert.equal(ruleOfThumb(9, 'turn'), .18);
  const r = rng(7), seen = new Set();
  for (let i = 0; i < 300; i++) {
    const sc = makeScenario(r); seen.add(sc.street);
    assert.ok(sc.pot >= 3 && sc.pot <= 40 && sc.bet >= .5);
    assert.ok(Math.abs(sc.need - sc.eq) >= .02);
    assert.equal(sc.ans, sc.eq > sc.need ? 'call' : 'fold');
    assert.ok(DRAWS.includes(sc.draw) && sc.draw.dirty.length > 20);
  }
  assert.deepEqual([...seen].sort(), ['flop', 'turn']);
});

test('Equity: exakt und Monte Carlo', () => {
  const c = s => parse(s).map(cint);
  assert.equal(exactEq(c('As Ad'), c('Ks Kd'), c('2c 3d 4h 8s 9c')), 1);
  assert.equal(exactEq(c('As Kd'), c('Ac Kh'), c('2c 3d 4h 8s 9c')), .5);
  const turn = exactEq(c('Ah Kh'), c('Qs Qd'), c('2h 7h 9c 3s'));
  assert.ok(Math.abs(turn - (9 + 3 + 3) / 44) < 1e-9, '9 Herz + 3 Asse + 3 Könige von 44');
  const flop = exactEq(c('As Ad'), c('Ks Kd'), c('2c 7d 9h'));
  assert.ok(flop > .9 && flop < .93);
  assert.throws(() => exactEq(c('As Ad'), c('Ks Kd'), c('2c 7d')), /mindestens 3/);
  const mc = mcEq(c('As Ad'), c('Ks Kd'), 4000, rng(3));
  assert.ok(Math.abs(mc - .82) < .03);
});
