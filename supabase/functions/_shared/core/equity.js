// Automatisch kopiert aus src/core/equity.js (npm run functions:sync). Nicht hier ändern.
// Gewinnwahrscheinlichkeit Hand gegen Hand. Karten als Zahlen 0..51.
import { eval7 } from './evaluator.js';

/** Monte Carlo bis zum River, ohne bekannte Boardkarten. */
export function mcEq(me, op, N = 20000, rng = Math.random) {
  const used = new Set([...me, ...op]), rest = [];
  for (let k = 0; k < 52; k++) if (!used.has(k)) rest.push(k);
  const A = new Int32Array(7), B = new Int32Array(7);
  A[0] = me[0]; A[1] = me[1]; B[0] = op[0]; B[1] = op[1];
  let w = 0;
  for (let n = 0; n < N; n++) {
    for (let k = 0; k < 5; k++) { const r = k + ((rng() * (rest.length - k)) | 0); const t = rest[k]; rest[k] = rest[r]; rest[r] = t; A[k + 2] = B[k + 2] = rest[k]; }
    const a = eval7(A), b = eval7(B);
    w += a > b ? 1 : a === b ? .5 : 0;
  }
  return w / N;
}

/** Exakt über alle restlichen Boardkarten; board hat 3, 4 oder 5 Karten. */
export function exactEq(me, op, board) {
  const used = new Set([...me, ...op, ...board]), rest = [];
  for (let k = 0; k < 52; k++) if (!used.has(k)) rest.push(k);
  const A = [me[0], me[1], ...board], B = [op[0], op[1], ...board];
  const missing = 5 - board.length;
  let w = 0, n = 0;
  const score = () => { const a = eval7(A), b = eval7(B); w += a > b ? 1 : a === b ? .5 : 0; n++; };
  if (missing === 0) score();
  else if (missing === 1) for (const x of rest) { A.push(x); B.push(x); score(); A.pop(); B.pop(); }
  else if (missing === 2) {
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      A.push(rest[i], rest[j]); B.push(rest[i], rest[j]); score(); A.length -= 2; B.length -= 2;
    }
  } else throw new Error('exactEq braucht mindestens 3 Boardkarten');
  return w / n;
}
