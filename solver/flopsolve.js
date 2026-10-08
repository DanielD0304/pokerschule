// Flop-Solver (CFR+) für Single-Raised-Pots Heads-up, 100 BB, Kombo-Ebene.
// Turn/River werden über Equity-Realisierung abgebildet (exakte Flop-Equity Kombo gegen Kombo).
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const RANKS = '23456789TJQKA', SUITS = 'shdc';
const card = s => RANKS.indexOf(s[0]) * 4 + SUITS.indexOf(s[1]);

const TREE = {
  f_root:   { p: 'BB', a: ['check', 'donk'], c: ['f_ip', 'f_vsDonk'] },
  f_ip:     { p: 'SB', a: ['check', 'b33', 'b75'], c: ['t_xx', 'f_vsB33', 'f_vsB75'] },
  f_vsB33:  { p: 'BB', a: ['fold', 'call', 'raise'], c: ['t_f33', 't_c33', 'f_vsR33'] },
  f_vsR33:  { p: 'SB', a: ['fold', 'call'], c: ['t_fr33', 't_cr33'] },
  f_vsB75:  { p: 'BB', a: ['fold', 'call', 'raise'], c: ['t_f75', 't_c75', 'f_vsR75'] },
  f_vsR75:  { p: 'SB', a: ['fold', 'call'], c: ['t_fr75', 't_cr75'] },
  f_vsDonk: { p: 'SB', a: ['fold', 'call', 'raise'], c: ['t_fd', 't_cd', 'f_vsDR'] },
  f_vsDR:   { p: 'BB', a: ['fold', 'call'], c: ['t_fdr', 't_cdr'] },
  t_xx:  { t: 'sd', pot: 5, inv: 2.5, d: .08 },
  t_f33: { t: 'fold', sb: 2.5 }, t_c33: { t: 'sd', pot: 8.3, inv: 4.15, d: .06 },
  t_fr33: { t: 'fold', sb: -4.15 }, t_cr33: { t: 'sd', pot: 15, inv: 7.5, d: .03 },
  t_f75: { t: 'fold', sb: 2.5 }, t_c75: { t: 'sd', pot: 12.5, inv: 6.25, d: .06 },
  t_fr75: { t: 'fold', sb: -6.25 }, t_cr75: { t: 'sd', pot: 27, inv: 13.5, d: .03 },
  t_fd: { t: 'fold', sb: -2.5 }, t_cd: { t: 'sd', pot: 8.3, inv: 4.15, d: .06 },
  t_fdr: { t: 'fold', sb: 4.15 }, t_cdr: { t: 'sd', pot: 15, inv: 7.5, d: .03 },
};
const BOARDS = ['As7d2c', 'Kc8h3s', 'Qh9h4c', 'Jd9c8d', '7h6h5c', 'Tc5c2c', '8d8s3c', 'AhKdQs', '9s4d2h', 'KhKs5d', 'Ad5s4h', 'Js7s3d'];

// --- Bewertung (wie im Browser) ---
const STR = new Int8Array(8192), PC = new Uint8Array(8192);
for (let m = 0; m < 8192; m++) { const ext = (m << 1) | ((m >> 12) & 1); let h = -1; for (let t = 13; t >= 4; t--) if (((ext >> (t - 4)) & 31) === 31) { h = t - 1; break; } STR[m] = h; let c = 0, x = m; while (x) { x &= x - 1; c++; } PC[m] = c; }
const _c = new Int8Array(13), _s = new Int32Array(4);
const top = (mask, n) => { let v = 0, k = 0; for (let r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) { v = (v << 4) | r; k++; } return v << (4 * (5 - n)); };
function eval7(c) {
  _c.fill(0); _s.fill(0); let rm = 0;
  for (let k = 0; k < 7; k++) { const r = c[k] >> 2; _c[r]++; _s[c[k] & 3] |= 1 << r; rm |= 1 << r; }
  let fl = 0; for (let s = 0; s < 4; s++) if (PC[_s[s]] >= 5) { const sf = STR[_s[s]]; if (sf >= 0) return (8 << 20) | sf; fl = _s[s]; }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) { const n = _c[r]; if (n === 4) q = r; else if (n === 3) { if (t1 < 0) t1 = r; else t2 = r; } else if (n === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; } }
  if (q >= 0) return (7 << 20) | (q << 16) | top(rm & ~(1 << q), 1);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  if (fl) return (5 << 20) | top(fl, 5);
  const st = STR[rm]; if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (top(rm & ~(1 << t1), 2) >> 4);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (top(rm & ~(1 << p1) & ~(1 << p2), 1) >> 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (top(rm & ~(1 << p1), 3) >> 4);
  return top(rm, 5);
}
const classOf = (a, b) => { const i = a >> 2, j = b >> 2, hi = Math.max(i, j), lo = Math.min(i, j); if (i === j) return i * 14; return (a & 3) === (b & 3) ? hi * 13 + lo : lo * 13 + hi; };

function solve(boardStr) {
  const HU = JSON.parse(fs.readFileSync(__dirname + '/hu-strat.json', 'utf8'));
  const board = [0, 2, 4].map(k => card(boardStr.slice(k, k + 2)));
  const isB = new Uint8Array(52); board.forEach(c => isB[c] = 1);
  const all = []; for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) if (!isB[a] && !isB[b]) all.push([b, a]);
  const S = [], SW = [], B = [], BW = [];
  for (const [a, b] of all) { const k = classOf(a, b); const ws = HU.root[k][1], wb = HU.vsOpen[k][1];
    if (ws > .001) { S.push([a, b]); SW.push(ws); } if (wb > .001) { B.push([a, b]); BW.push(wb); } }
  const nS = S.length, nB = B.length;
  // Kompatibilität + exakte Equity
  const C = new Float64Array(nS * nB), WIN = new Float64Array(nS * nB);
  for (let s = 0; s < nS; s++) for (let b = 0; b < nB; b++) { const x = S[s], y = B[b]; C[s * nB + b] = (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) ? 1 : 0; }
  const rest = []; for (let c = 0; c < 52; c++) if (!isB[c]) rest.push(c);
  const hand = new Int32Array(7); hand[2] = board[0]; hand[3] = board[1]; hand[4] = board[2];
  const rS = new Int32Array(nS), rB = new Int32Array(nB);
  for (let x = 0; x < rest.length; x++) for (let y = x + 1; y < rest.length; y++) {
    const t = rest[x], r = rest[y]; hand[5] = t; hand[6] = r;
    for (let s = 0; s < nS; s++) { const h = S[s]; if (h[0] === t || h[0] === r || h[1] === t || h[1] === r) { rS[s] = -1; continue; } hand[0] = h[0]; hand[1] = h[1]; rS[s] = eval7(hand); }
    for (let b = 0; b < nB; b++) { const h = B[b]; if (h[0] === t || h[0] === r || h[1] === t || h[1] === r) { rB[b] = -1; continue; } hand[0] = h[0]; hand[1] = h[1]; rB[b] = eval7(hand); }
    for (let s = 0; s < nS; s++) { const vs = rS[s]; if (vs < 0) continue; const o = s * nB; for (let b = 0; b < nB; b++) { const vb = rB[b]; if (vb < 0 || !C[o + b]) continue; WIN[o + b] += vs > vb ? 1 : vs === vb ? .5 : 0; } }
  }
  const E = new Float64Array(nS * nB); for (let k = 0; k < E.length; k++) E[k] = C[k] ? WIN[k] / 990 : 0;
  // Auszahlungsmatrizen je Realisierungsfaktor
  const F = {}; for (const d of [.08, .06, .03]) { const M = new Float64Array(nS * nB); for (let k = 0; k < M.length; k++) { const e = E[k]; M[k] = C[k] ? e + d * 4 * e * (1 - e) : 0; } F[d] = M; }
  const mvS = (M, rb, out) => { for (let s = 0; s < nS; s++) { let v = 0; const o = s * nB; for (let b = 0; b < nB; b++) v += M[o + b] * rb[b]; out[s] = v; } return out; };
  const mvB = (M, rs, out) => { out.fill(0); for (let s = 0; s < nS; s++) { const w = rs[s]; if (!w) continue; const o = s * nB; for (let b = 0; b < nB; b++) out[b] += M[o + b] * w; } return out; };
  function term(t, rs, rb) {
    const uS = new Float64Array(nS), uB = new Float64Array(nB);
    const cS = mvS(C, rb, new Float64Array(nS)), cB = mvB(C, rs, new Float64Array(nB));
    if (t.t === 'fold') { for (let s = 0; s < nS; s++) uS[s] = t.sb * cS[s]; for (let b = 0; b < nB; b++) uB[b] = -t.sb * cB[b]; return [uS, uB]; }
    const fS = mvS(F[t.d], rb, new Float64Array(nS)), fB = mvB(F[t.d], rs, new Float64Array(nB));
    for (let s = 0; s < nS; s++) uS[s] = t.pot * fS[s] - t.inv * cS[s];
    for (let b = 0; b < nB; b++) uB[b] = -(t.pot * fB[b] - t.inv * cB[b]); // Σ_s C·rs·(−payoffSB)
    return [uS, uB];
  }
  const R = {}, SS = {};
  for (const [id, n] of Object.entries(TREE)) if (!n.t) { const m = n.p === 'SB' ? nS : nB; R[id] = new Float64Array(m * n.a.length); SS[id] = new Float64Array(m * n.a.length); }
  const sigma = (id, m, A, avg) => { const src = avg ? SS[id] : R[id], o = new Float64Array(m * A); for (let h = 0; h < m; h++) { let s = 0; for (let a = 0; a < A; a++) s += src[h * A + a]; for (let a = 0; a < A; a++) o[h * A + a] = s > 0 ? src[h * A + a] / s : 1 / A; } return o; };
  const EVS = {};
  function walk(id, rs, rb, it, avg) {
    const n = TREE[id]; if (n.t) return term(n, rs, rb);
    const p = n.p === 'SB' ? 0 : 1, m = p ? nB : nS, A = n.a.length, sg = sigma(id, m, A, avg);
    const uS = new Float64Array(nS), uB = new Float64Array(nB), ua = [];
    for (let a = 0; a < A; a++) {
      const my = p ? rb : rs, r2 = new Float64Array(m); for (let h = 0; h < m; h++) r2[h] = my[h] * sg[h * A + a];
      const [cs, cb] = p ? walk(n.c[a], rs, r2, it, avg) : walk(n.c[a], r2, rb, it, avg);
      ua.push(p ? cb : cs);
      for (let h = 0; h < nS; h++) uS[h] += p ? cs[h] : sg[h * A + a] * cs[h];
      for (let h = 0; h < nB; h++) uB[h] += p ? sg[h * A + a] * cb[h] : cb[h];
    }
    const u = p ? uB : uS, my = p ? rb : rs;
    if (avg) { // EV je Aktion, normiert auf die Gegner-Reichweite
      const norm = p ? mvB(C, rs, new Float64Array(nB)) : mvS(C, rb, new Float64Array(nS));
      const ev = new Float64Array(m * A); for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) ev[h * A + a] = norm[h] > 1e-9 ? ua[a][h] / norm[h] : 0;
      EVS[id] = ev; return [uS, uB];
    }
    for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) { const k = h * A + a; R[id][k] = Math.max(0, R[id][k] + ua[a][h] - u[h]); SS[id][k] += it * my[h] * sg[k]; }
    return [uS, uB];
  }
  const rs0 = Float64Array.from(SW), rb0 = Float64Array.from(BW);
  const N = workerData && workerData.N || 400;
  for (let it = 1; it <= N; it++) { walk('f_root', rs0, rb0, it, false); walk('f_root', rs0, rb0, it, false); }
  // Bewertung mit Durchschnittsstrategie (Reichweite = Gleichgewicht)
  walk('f_root', rs0, rb0, 0, true);
  // Equity gegen Gegner-Range auf dem Flop
  const eqS = mvS(E, rb0, new Float64Array(nS)), nrmS = mvS(C, rb0, new Float64Array(nS));
  const eqB = mvB(E, rs0, new Float64Array(nB)), nrmB = mvB(C, rs0, new Float64Array(nB));
  const out = { board: boardStr, sb: { c: S.map(([a, b]) => a * 52 + b), w: SW.map(w => Math.round(w * 1000)), eq: Array.from(eqS, (v, s) => Math.round(v / nrmS[s] * 1000)) },
    bb: { c: B.map(([a, b]) => a * 52 + b), w: BW.map(w => Math.round(w * 1000)), eq: Array.from(eqB, (v, b) => Math.round((1 - v / nrmB[b]) * 1000)) }, n: {} };
  // eqB: E ist aus SB-Sicht; Σ C·rs·E / Σ C·rs = SB-Equity → BB = 1 − das
  for (const [id, n] of Object.entries(TREE)) if (!n.t) { const m = n.p === 'SB' ? nS : nB, A = n.a.length, sg = sigma(id, m, A, true);
    out.n[id] = { s: Array.from(sg, v => Math.round(v * 100)), e: Array.from(EVS[id], v => Math.round(v * 100)) }; }
  // Kontrolle: Häufigkeiten gewichtet mit Reichweite
  const freq = {}; const reach = { f_root: [rs0, rb0] };
  for (const id of ['f_root', 'f_ip', 'f_vsDonk', 'f_vsB33', 'f_vsB75', 'f_vsR33', 'f_vsR75', 'f_vsDR']) { const n = TREE[id]; if (!reach[id]) continue; const p = n.p === 'SB' ? 0 : 1, A = n.a.length, sg = sigma(id, p ? nB : nS, A, true), rr = reach[id][p];
    const tot = new Float64Array(A); let w = 0; for (let h = 0; h < rr.length; h++) { w += rr[h]; for (let a = 0; a < A; a++) tot[a] += rr[h] * sg[h * A + a]; }
    freq[id] = n.a.map((a, x) => a + ' ' + (tot[x] / w * 100).toFixed(0) + '%').join(' ');
    n.c.forEach((c, a) => { if (!TREE[c].t) { const nr = [reach[id][0], reach[id][1]].map(v => Float64Array.from(v)); for (let h = 0; h < nr[p].length; h++) nr[p][h] *= sg[h * A + a]; reach[c] = nr; } }); }
  return { out, freq, nS, nB };
}

if (!isMainThread) { parentPort.postMessage(solve(workerData.board)); }
else {
  const N = +process.argv[2] || 400, t0 = Date.now(), only = process.argv[3];
  const list = only ? [only] : BOARDS;
  Promise.all(list.map(board => new Promise((ok, no) => { const w = new Worker(__filename, { workerData: { board, N } }); w.on('message', ok); w.on('error', no); })))
    .then(res => {
      for (const r of res) console.log(r.out.board, 'nS', r.nS, 'nB', r.nB, JSON.stringify(r.freq));
      fs.writeFileSync(__dirname + '/flop-data.json', JSON.stringify({ tree: TREE, boards: res.map(r => r.out) }));
      console.log('fertig', (Date.now() - t0) / 1000, 's', fs.statSync(__dirname + '/flop-data.json').size, 'bytes');
    });
}
