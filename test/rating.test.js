import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grade, accuracy, difficulty, expected, eloDelta, applyDecision, K_DIFF, QUAL, GOOD } from '../src/core/rating.js';
import { modeState } from '../src/core/storage.js';

test('grade: Schwellen 0,03 / 0,3 / 1 BB', () => {
  assert.deepEqual(grade(0, .02), { q: 'eq', correct: true });
  assert.deepEqual(grade(.02, .5), { q: 'best', correct: true });
  assert.deepEqual(grade(0, .1), { q: 'sharp', correct: true });
  assert.deepEqual(grade(.03, .03), { q: 'inacc', correct: false });
  assert.deepEqual(grade(.29, .29), { q: 'inacc', correct: false });
  assert.deepEqual(grade(.3, .3), { q: 'mist', correct: false });
  assert.deepEqual(grade(.99, 1), { q: 'mist', correct: false });
  assert.deepEqual(grade(1, 1), { q: 'blun', correct: false });
  for (const q of ['best', 'sharp', 'eq', 'inacc', 'mist', 'blun']) assert.ok(QUAL[q]);
  assert.ok(GOOD.has('sharp') && !GOOD.has('inacc'));
});

test('accuracy und Schwierigkeit', () => {
  assert.equal(accuracy(true, 5), 100);
  assert.equal(accuracy(false, 0), 100);
  assert.ok(Math.abs(accuracy(false, .75) - 100 / Math.E) < 1e-9);
  assert.equal(difficulty(0, .4), 2000);
  assert.ok(difficulty(10, .4) < 201);
  assert.ok(difficulty(.2, K_DIFF.flop) < difficulty(.2, K_DIFF.river), 'Flop-Spots gelten bei gleichem Abstand als leichter');
  assert.equal(expected(1000, 1000), .5);
  assert.ok(Math.abs(expected(1400, 1000) - 1 / 1.1) < 1e-12);
});

test('eloDelta: K-Faktor, gleichwertig, Vorzeichen', () => {
  assert.equal(eloDelta(1000, 0, { q: 'eq', correct: true }, 0, .01, .4), 0);
  const easyRight = eloDelta(1000, 0, { q: 'best', correct: true }, 0, 5, .4);
  const easyWrong = eloDelta(1000, 0, { q: 'blun', correct: false }, 5, 5, .4);
  assert.ok(easyRight >= 0 && easyRight < 5, 'leichte richtige Entscheidung bringt wenig');
  assert.ok(easyWrong < -30, 'leichter Patzer kostet viel');
  const hardRight = eloDelta(1000, 0, { q: 'sharp', correct: true }, 0, .05, .4);
  assert.ok(hardRight > 20, 'knappe richtige Entscheidung bringt viel');
  assert.equal(eloDelta(1000, 30, { q: 'blun', correct: false }, 5, 5, .4), Math.round(easyWrong / 2), 'ab 30 Entscheidungen halber K-Faktor');
});

test('applyDecision verbucht Rating, Genauigkeit und Klasse', () => {
  const ms = modeState();
  const r1 = applyDecision(ms, [-.5, 1.2], 1, K_DIFF.arena);
  assert.equal(r1.q, 'best'); assert.equal(r1.bi, 1); assert.equal(ms.n, 1); assert.equal(ms.accN, 1); assert.equal(ms.cls.best, 1);
  const r2 = applyDecision(ms, [-1, 2, 1.99], 0, K_DIFF.duel);
  assert.equal(r2.q, 'blun'); assert.ok(r2.delta < 0); assert.ok(ms.rating < 1000 + r1.delta);
  const before = ms.rating, r3 = applyDecision(ms, [0, .01], 0, K_DIFF.river);
  assert.equal(r3.q, 'eq'); assert.equal(ms.rating, before); assert.equal(ms.n, 2);
  ms.rating = 120; applyDecision(ms, [-10, 10], 0, .4);
  assert.ok(ms.rating >= 100, 'Untergrenze 100');
  assert.equal(applyDecision(modeState(), [3], 0, .4).q, 'best', 'nur eine Option');
});
