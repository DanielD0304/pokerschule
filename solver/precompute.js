// Preflop-Equity (169×169, Monte Carlo) und Push/Fold-Gleichgewicht für 2–20 BB.
// Aufruf: node solver/precompute.js [samples]   → data/pf-data.json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { CMB, compatMatrix, labelId } from '../src/core/cards.js';
import { eval7 } from '../src/core/evaluator.js';
import { DATA_DIR } from './paths.js';

if (!isMainThread) {
  const { pairs, T } = workerData, res = [];
  const deck = new Int32Array(52), A = new Int32Array(7), B = new Int32Array(7);
  for (const [a, b] of pairs) {
    const ca = CMB[a], cb = CMB[b]; let win = 0, n = 0;
    while (n < T) {
      const x = ca[(Math.random() * ca.length) | 0], y = cb[(Math.random() * cb.length) | 0];
      if (x[0] === y[0] || x[0] === y[1] || x[1] === y[0] || x[1] === y[1]) continue;
      let d = 0; for (let k = 0; k < 52; k++) if (k !== x[0] && k !== x[1] && k !== y[0] && k !== y[1]) deck[d++] = k;
      for (let k = 0; k < 5; k++) { const r = k + ((Math.random() * (48 - k)) | 0); const t = deck[k]; deck[k] = deck[r]; deck[r] = t; A[k + 2] = B[k + 2] = deck[k]; }
      A[0] = x[0]; A[1] = x[1]; B[0] = y[0]; B[1] = y[1];
      const ea = eval7(A), eb = eval7(B);
      win += ea > eb ? 1 : ea === eb ? .5 : 0; n++;
    }
    res.push(win / n);
  }
  parentPort.postMessage(res);
} else {
  const T = +process.argv[2] || 30000;
  const pairs = []; for (let a = 0; a < 169; a++) for (let b = a; b < 169; b++) pairs.push([a, b]);
  const W = os.cpus().length, chunks = Array.from({ length: W }, () => []);
  pairs.forEach((p, k) => chunks[k % W].push(p));
  const t0 = Date.now();
  const results = await Promise.all(chunks.map(ch => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { pairs: ch, T } }); w.on('message', ok); w.on('error', no);
  })));
  const EQ = Array.from({ length: 169 }, () => new Float64Array(169));
  results.forEach((r, w) => r.forEach((e, k) => { const [a, b] = chunks[w][k]; EQ[a][b] = e; EQ[b][a] = 1 - e; }));
  for (let a = 0; a < 169; a++) EQ[a][a] = .5;
  console.log('Equity fertig', (Date.now() - t0) / 1000, 's');

  // Push/Fold-Gleichgewicht per Fictitious Play
  const C = compatMatrix(), nash = {};
  for (let S = 2; S <= 20; S++) {
    const p = new Float64Array(169).fill(1), c = new Float64Array(169).fill(1);
    for (let it = 1; it <= 3000; it++) {
      const brc = new Float64Array(169);
      for (let j = 0; j < 169; j++) { let w = 0, ev = 0; for (let i = 0; i < 169; i++) { const ww = C[j][i] * p[i]; w += ww; ev += ww * S * (2 * EQ[j][i] - 1); } brc[j] = (w > 0 && ev / w > -1) ? 1 : 0; }
      const brp = new Float64Array(169);
      for (let i = 0; i < 169; i++) { let w = 0, ev = 0; for (let j = 0; j < 169; j++) { const ww = C[i][j]; w += ww; ev += ww * ((1 - c[j]) * 1 + c[j] * S * (2 * EQ[i][j] - 1)); } brp[i] = ev / w > -0.5 ? 1 : 0; }
      const lr = 1 / (it + 1);
      for (let k = 0; k < 169; k++) { c[k] += (brc[k] - c[k]) * lr; p[k] += (brp[k] - p[k]) * lr; }
    }
    const enc = a => Array.from(a, v => { const t = Math.round(v * 10); return t >= 10 ? 'a' : String(t); }).join('');
    nash[S] = { push: enc(p), call: enc(c) };
  }
  const buf = Buffer.alloc(pairs.length * 2);
  pairs.forEach(([a, b], k) => buf.writeUInt16LE(Math.round(EQ[a][b] * 65535), k * 2));
  fs.writeFileSync(DATA_DIR + '/pf-data.json', JSON.stringify({ eq: buf.toString('base64'), nash }));
  console.log('fertig', (Date.now() - t0) / 1000, 's');
  const e = (x, y) => EQ[labelId(x)][labelId(y)].toFixed(3);
  console.log('AA–KK', e('AA', 'KK'), 'AKs–QQ', e('AKs', 'QQ'), '72o–AKo', e('72o', 'AKo'));
}
