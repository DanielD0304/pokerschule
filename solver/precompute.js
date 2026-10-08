// Precompute preflop equity table (169x169) + heads-up push/fold Nash for stacks 2..20 BB
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const fs = require('fs');

// class id = i*13+j ; i==j pair ; i>j suited (high i, low j) ; i<j offsuit (high j, low i)
function combosOf(id) {
  const i = Math.floor(id / 13), j = id % 13, out = [];
  if (i === j) { for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([i * 4 + a, i * 4 + b]); }
  else if (i > j) { for (let s = 0; s < 4; s++) out.push([i * 4 + s, j * 4 + s]); }
  else { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([j * 4 + a, i * 4 + b]); }
  return out;
}
const COMBOS = Array.from({ length: 169 }, (_, k) => combosOf(k));

const STR = new Int8Array(8192);
for (let m = 0; m < 8192; m++) {
  const ext = (m << 1) | ((m >> 12) & 1); let h = -1;
  for (let t = 13; t >= 4; t--) if (((ext >> (t - 4)) & 31) === 31) { h = t - 1; break; }
  STR[m] = h; // rank index of high card (3 = five-high wheel)
}
const pc = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const PC = new Uint8Array(8192); for (let m = 0; m < 8192; m++) PC[m] = pc(m);
const counts = new Int8Array(13), sm = new Int32Array(4);
function eval7(c) {
  counts.fill(0); sm.fill(0); let rm = 0;
  for (let k = 0; k < 7; k++) { const r = c[k] >> 2; counts[r]++; sm[c[k] & 3] |= 1 << r; rm |= 1 << r; }
  let flush = 0;
  for (let s = 0; s < 4; s++) if (PC[sm[s]] >= 5) { const sf = STR[sm[s]]; if (sf >= 0) return (8 << 20) | sf; flush = sm[s]; }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1, p3 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r];
    if (n === 4) q = r; else if (n === 3) { if (t1 < 0) t1 = r; else t2 = r; }
    else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; else p3 = r; }
  }
  const top = (mask, n) => { let v = 0, k = 0; for (let r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) { v = (v << 4) | r; k++; } return v << (4 * (5 - n)); };
  if (q >= 0) return (7 << 20) | (q << 16) | (top(rm & ~(1 << q), 1));
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  if (flush) return (5 << 20) | top(flush, 5);
  const st = STR[rm]; if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (top(rm & ~(1 << t1), 2) >> 4);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (top(rm & ~(1 << p1) & ~(1 << p2), 1) >> 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (top(rm & ~(1 << p1), 3) >> 4);
  return top(rm, 5);
}

if (!isMainThread) {
  const { pairs, T } = workerData; const res = [];
  const deck = new Int32Array(52), A = new Int32Array(7), B = new Int32Array(7);
  for (const [a, b] of pairs) {
    const ca = COMBOS[a], cb = COMBOS[b]; let win = 0, n = 0;
    while (n < T) {
      const x = ca[(Math.random() * ca.length) | 0], y = cb[(Math.random() * cb.length) | 0];
      if (x[0] === y[0] || x[0] === y[1] || x[1] === y[0] || x[1] === y[1]) continue;
      let d = 0; for (let k = 0; k < 52; k++) if (k !== x[0] && k !== x[1] && k !== y[0] && k !== y[1]) deck[d++] = k;
      for (let k = 0; k < 5; k++) { const r = k + ((Math.random() * (48 - k)) | 0); const tmp = deck[k]; deck[k] = deck[r]; deck[r] = tmp; A[k + 2] = B[k + 2] = deck[k]; }
      A[0] = x[0]; A[1] = x[1]; B[0] = y[0]; B[1] = y[1];
      const ea = eval7(A), eb = eval7(B);
      win += ea > eb ? 1 : ea === eb ? 0.5 : 0; n++;
    }
    res.push(win / n);
  }
  parentPort.postMessage(res);
} else {
  const T = +process.argv[2] || 4000;
  const pairs = []; for (let a = 0; a < 169; a++) for (let b = a; b < 169; b++) pairs.push([a, b]);
  const W = os.cpus().length, chunks = Array.from({ length: W }, () => []);
  pairs.forEach((p, k) => chunks[k % W].push(p));
  const t0 = Date.now();
  Promise.all(chunks.map(ch => new Promise((ok, no) => { const w = new Worker(__filename, { workerData: { pairs: ch, T } }); w.on('message', ok); w.on('error', no); })))
    .then(results => {
      const EQ = Array.from({ length: 169 }, () => new Float64Array(169));
      results.forEach((r, w) => r.forEach((e, k) => { const [a, b] = chunks[w][k]; EQ[a][b] = e; EQ[b][a] = 1 - e; }));
      for (let a = 0; a < 169; a++) EQ[a][a] = 0.5;
      console.log('equity done', (Date.now() - t0) / 1000, 's');
      // compat[a][b]: avg # of b-combos compatible with a specific a-combo
      const C = Array.from({ length: 169 }, () => new Float64Array(169));
      for (let a = 0; a < 169; a++) for (let b = 0; b < 169; b++) {
        let s = 0; for (const x of COMBOS[a]) for (const y of COMBOS[b]) if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) s++;
        C[a][b] = s / COMBOS[a].length;
      }
      const nash = {};
      for (let S = 2; S <= 20; S++) {
        const p = new Float64Array(169).fill(1), c = new Float64Array(169).fill(1);
        const N = 3000;
        for (let it = 1; it <= N; it++) {
          // BB best response to p
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
      // equity: upper triangle incl diag, uint16
      const buf = Buffer.alloc(pairs.length * 2);
      pairs.forEach(([a, b], k) => buf.writeUInt16LE(Math.round(EQ[a][b] * 65535), k * 2));
      fs.writeFileSync(__dirname + '/pf-data.json', JSON.stringify({ eq: buf.toString('base64'), nash }));
      console.log('all done', (Date.now() - t0) / 1000, 's');
      const lab = id => { const i = Math.floor(id / 13), j = id % 13, R = '23456789TJQKA'; return i === j ? R[i] + R[j] : i > j ? R[i] + R[j] + 's' : R[j] + R[i] + 'o'; };
      const id = l => { const R = '23456789TJQKA', h = R.indexOf(l[0]), lo = R.indexOf(l[1]); return h === lo ? h * 13 + h : l[2] === 's' ? h * 13 + lo : lo * 13 + h; };
      console.log('AA vs KK', EQ[id('AA')][id('KK')].toFixed(3), 'AKs vs QQ', EQ[id('AKs')][id('QQ')].toFixed(3), '72o vs AKo', EQ[id('72o')][id('AKo')].toFixed(3));
      for (const S of [5, 10, 15]) { const pp = nash[S].push; let comb = 0; for (let k = 0; k < 169; k++) comb += COMBOS[k].length * (pp[k] === 'a' ? 1 : +pp[k] / 10); const cc = nash[S].call; let cb = 0; for (let k = 0; k < 169; k++) cb += COMBOS[k].length * (cc[k] === 'a' ? 1 : +cc[k] / 10); console.log(S, 'BB push%', (comb / 13.26).toFixed(1), 'call%', (cb / 13.26).toFixed(1), 'pushes 72o?', pp[id('72o')], 'K2o?', pp[id('K2o')]); }
    });
}
