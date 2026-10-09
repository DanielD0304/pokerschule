import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eval7, evalCards, toArray, handName, best5, category, compare } from '../src/core/evaluator.js';
import { parse, cint } from '../src/core/cards.js';
import { refEval7, refCategory } from './reference-evaluator.js';

const ints = s => parse(s).map(cint);
const ev = s => eval7(ints(s));
const sign = x => (x > 0) - (x < 0);

// Kleiner, reproduzierbarer Zufallsgenerator (mulberry32)
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('B1: der Kicker eines Vierlings überschreibt nicht den Rang', () => {
  assert.ok(ev('Ks Kd Kh Kc 2d 3c 4h') > ev('Qs Qd Qh Qc As 3c 4h'), 'Vierling Könige schlägt Vierling Damen mit Ass-Kicker');
  assert.ok(ev('As Ad Ah Ac Kd 2c 3h') > ev('As Ad Ah Ac Qd 2c 3h'), 'höherer Kicker gewinnt');
  assert.equal(ev('9s 9d 9h 9c Kd 2c 3h'), ev('9s 9d 9h 9c Kh 5c 4h'), 'gleicher Kicker → Split');
  assert.deepEqual(toArray(ev('As Ad Ah Ac Kd 2c 3h')), [7, 14, 13]);
});

test('Sonderfälle', () => {
  assert.deepEqual(toArray(ev('As 2d 3h 4c 5d 9c Kh')), [4, 5], 'Wheel ist Straße bis Fünf');
  assert.ok(ev('6s 2d 3h 4c 5d 9c Kh') > ev('As 2d 3h 4c 5d 9c Kh'), 'Sechs-hohe Straße schlägt Wheel');
  assert.ok(ev('9h 8h 7h 6h 5h As Ad') > ev('Ah Kh 7h 6h 2h Ks Kd'), 'Straight Flush schlägt Flush');
  assert.deepEqual(toArray(ev('Ks Kd Kh 7s 7d 7h 2c')), [6, 13, 7], 'zwei Drillinge → Full House');
  assert.equal(ev('As Ks Qs Js Ts 2d 3d'), (8 << 20) | 12);
  assert.equal(handName(ev('As Ks Qs Js Ts 2d 3d')), 'Royal Flush');
  assert.equal(ev('2c 3c Ah Kh Qh Jh Th') === ev('4d 5d Ah Kh Qh Jh Th'), true, 'Board-Royal → Split');
  assert.deepEqual(toArray(ev('Js Jd 4s 4d 2c 2h Ac')), [2, 11, 4, 14], 'drei Paare: Kicker kann das dritte Paar sein');
});

test('Anzeige: Namen, beste fünf Karten, Fünf-Karten-Bewertung', () => {
  assert.equal(handName(ev('Ks Kd Kh Kc 2d 3c 4h')), 'Vierling Könige, Kicker Vier');
  assert.equal(handName(ev('Ah Ad 9c 6s 2h 3d 4c')), 'Paar Asse, Kicker Neun');
  assert.equal(handName(ev('Kd Js 8c 5h 3d 2c 7h')), 'König hoch');
  assert.match(handName(ev('Ad Jd 8d 5d 2d Ks Kc')), /^Flush, Ass hoch$/);
  assert.match(handName(ev('Kh Kd Ks 7c 7h 2d 3c')), /Full House, Könige über Siebenen/);
  assert.match(handName(ev('Jh Jc 4s 4d Ac 2d 3h')), /Zwei Paare, Buben und Vieren, Kicker Ass/);
  assert.match(handName(ev('8s 8h 8d Kc 3s 2d 4h')), /Drilling Achten/);
  assert.match(handName(ev('Tc 9d 8s 7h 6c 2d 2h')), /Straße bis Zehn/);
  assert.match(handName(ev('9h 8h 7h 6h 5h 2d 2c')), /Straight Flush bis Neun/);
  const b = best5(parse('As Ks Qs Js Ts 2d 3d'));
  assert.equal(category(b.score), 8);
  assert.equal(b.cards.length, 5);
  assert.equal(evalCards(parse('Ah Kh Qh Jh 9h')), eval7(ints('Ah Kh Qh Jh 9h')));
  assert.ok(compare(ev('Ah Ad 2c 3d 4h 7s 9c'), ev('Kh Kd 2c 3d 4h 7s 9c')) > 0);
});

test('1 Mio. zufällige Vergleiche stimmen mit der Referenz überein', () => {
  const r = rng(20261008), deck = [...Array(52).keys()];
  let mismatches = 0;
  const N = 1_000_000;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 9; k++) { const j = k + ((r() * (52 - k)) | 0); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const A = [deck[0], deck[1], deck[4], deck[5], deck[6], deck[7], deck[8]];
    // Jeder zweite Vergleich auf demselben Board (Kicker-Fälle), sonst zwei unabhängige Hände
    const B = i % 2 ? [deck[2], deck[3], deck[4], deck[5], deck[6], deck[7], deck[8]] : null;
    const Bfull = B || (() => { const d2 = deck.slice(9); for (let k = 0; k < 7; k++) { const j = k + ((r() * (d2.length - k)) | 0); const t = d2[k]; d2[k] = d2[j]; d2[j] = t; } return d2.slice(0, 7); })();
    const fa = eval7(A), fb = eval7(Bfull);
    const ra = refEval7(A), rb = refEval7(Bfull);
    if (sign(fa - fb) !== sign(ra - rb) || (fa >> 20) !== refCategory(ra) || (fb >> 20) !== refCategory(rb)) mismatches++;
  }
  assert.equal(mismatches, 0);
});
