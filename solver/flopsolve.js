// Flop-Solver (CFR+) für Single-Raised-Pots heads-up, 100 BB, auf Kombo-Ebene.
// Turn und River werden über Equity-Realisierung abgebildet (exakte Flop-Equity Kombo gegen Kombo).
// Aufruf: node solver/flopsolve.js [iter] [board]   liest data/hu-strat.json → data/flop-data.json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { cardFromStr, classOfInts } from '../src/core/cards.js';
import { eval7 } from '../src/core/evaluator.js';
import { DATA_DIR } from './paths.js';

export const TREE = {
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
const POT = 5;

function solve(boardStr, N) {
  const HU = JSON.parse(fs.readFileSync(DATA_DIR + '/hu-strat.json', 'utf8'));
  const board = [0, 2, 4].map(k => cardFromStr(boardStr.slice(k, k + 2)));
  const isB = new Uint8Array(52); board.forEach(c => isB[c] = 1);
  const all = []; for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) if (!isB[a] && !isB[b]) all.push([b, a]);
  const S = [], SW = [], B = [], BW = [];
  for (const [a, b] of all) {
    const k = classOfInts(a, b), ws = HU.root[k][1], wb = HU.vsOpen[k][1];
    if (ws > .001) { S.push([a, b]); SW.push(ws); }
    if (wb > .001) { B.push([a, b]); BW.push(wb); }
  }
  const nS = S.length, nB = B.length;
  // Kompatibilität + exakte Equity über alle Turn/River-Karten
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
  const F = {}; for (const d of [.08, .06, .03]) { const M = new Float64Array(nS * nB); for (let k = 0; k < M.length; k++) { const e = E[k]; M[k] = C[k] ? e + d * 4 * e * (1 - e) : 0; } F[d] = M; }
  const mvS = (M, rb, out = new Float64Array(nS)) => { for (let s = 0; s < nS; s++) { let v = 0; const o = s * nB; for (let b = 0; b < nB; b++) v += M[o + b] * rb[b]; out[s] = v; } return out; };
  const mvB = (M, rs, out = new Float64Array(nB)) => { out.fill(0); for (let s = 0; s < nS; s++) { const w = rs[s]; if (!w) continue; const o = s * nB; for (let b = 0; b < nB; b++) out[b] += M[o + b] * w; } return out; };
  function term(t, rs, rb) {
    const uS = new Float64Array(nS), uB = new Float64Array(nB), cS = mvS(C, rb), cB = mvB(C, rs);
    if (t.t === 'fold') { for (let s = 0; s < nS; s++) uS[s] = t.sb * cS[s]; for (let b = 0; b < nB; b++) uB[b] = -t.sb * cB[b]; return [uS, uB]; }
    const fS = mvS(F[t.d], rb), fB = mvB(F[t.d], rs);
    for (let s = 0; s < nS; s++) uS[s] = t.pot * fS[s] - t.inv * cS[s];
    for (let b = 0; b < nB; b++) uB[b] = -(t.pot * fB[b] - t.inv * cB[b]);
    return [uS, uB];
  }
  const R = {}, SS = {}, EVS = {};
  for (const [id, n] of Object.entries(TREE)) if (!n.t) { const m = n.p === 'SB' ? nS : nB; R[id] = new Float64Array(m * n.a.length); SS[id] = new Float64Array(m * n.a.length); }
  const sigma = (id, m, A, avg) => { const src = avg ? SS[id] : R[id], o = new Float64Array(m * A); for (let h = 0; h < m; h++) { let s = 0; for (let a = 0; a < A; a++) s += src[h * A + a]; for (let a = 0; a < A; a++) o[h * A + a] = s > 0 ? src[h * A + a] / s : 1 / A; } return o; };
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
      const norm = p ? mvB(C, rs) : mvS(C, rb);
      const ev = new Float64Array(m * A); for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) ev[h * A + a] = norm[h] > 1e-9 ? ua[a][h] / norm[h] : 0;
      EVS[id] = ev; return [uS, uB];
    }
    for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) { const k = h * A + a; R[id][k] = Math.max(0, R[id][k] + ua[a][h] - u[h]); SS[id][k] += it * my[h] * sg[k]; }
    return [uS, uB];
  }
  // Best Response von Spieler p gegen die Durchschnittsstrategie des anderen
  function br(id, p, rs, rb) {
    const n = TREE[id]; if (n.t) { const [a, b] = term(n, rs, rb); return p ? b : a; }
    const q = n.p === 'SB' ? 0 : 1, A = n.a.length;
    if (q === p) { let best = null; for (let a = 0; a < A; a++) { const v = br(n.c[a], p, rs, rb); best = best ? best.map((x, h) => Math.max(x, v[h])) : v; } return best; }
    const m = q ? nB : nS, sg = sigma(id, m, A, true); let acc = null;
    for (let a = 0; a < A; a++) {
      const my = q ? rb : rs, r2 = new Float64Array(m); for (let h = 0; h < m; h++) r2[h] = my[h] * sg[h * A + a];
      const v = q ? br(n.c[a], p, rs, r2) : br(n.c[a], p, r2, rb); acc = acc ? acc.map((x, h) => x + v[h]) : Array.from(v);
    }
    return acc;
  }
  const rs0 = Float64Array.from(SW), rb0 = Float64Array.from(BW);
  for (let it = 1; it <= N; it++) { walk('f_root', rs0, rb0, it, false); walk('f_root', rs0, rb0, it, false); }
  const [vS, vB] = walk('f_root', rs0, rb0, 0, true);
  // Lösungsgüte: durchschnittlicher Gewinn eines perfekten Gegenspielers in % des Pots
  const tot = rs0.reduce((x, y, s) => x + y * mvS(C, rb0)[s], 0);
  const brS = br('f_root', 0, rs0, rb0), brB = br('f_root', 1, rs0, rb0);
  const gainS = brS.reduce((x, v, s) => x + rs0[s] * v, 0) - vS.reduce((x, v, s) => x + rs0[s] * v, 0);
  const gainB = brB.reduce((x, v, b) => x + rb0[b] * v, 0) - vB.reduce((x, v, b) => x + rb0[b] * v, 0);
  const expl = (gainS + gainB) / 2 / tot / POT * 100;
  // Equity gegen die Gegner-Range auf dem Flop (E ist aus SB-Sicht)
  const eqS = mvS(E, rb0), nrmS = mvS(C, rb0), eqB = mvB(E, rs0), nrmB = mvB(C, rs0);
  const out = {
    board: boardStr, expl: +expl.toFixed(3),
    sb: { c: S.map(([a, b]) => a * 52 + b), w: SW.map(w => Math.round(w * 1000)), eq: Array.from(eqS, (v, s) => Math.round(v / nrmS[s] * 1000)) },
    bb: { c: B.map(([a, b]) => a * 52 + b), w: BW.map(w => Math.round(w * 1000)), eq: Array.from(eqB, (v, b) => Math.round((1 - v / nrmB[b]) * 1000)) },
    n: {},
  };
  for (const [id, n] of Object.entries(TREE)) if (!n.t) {
    const m = n.p === 'SB' ? nS : nB, A = n.a.length, sg = sigma(id, m, A, true);
    out.n[id] = { s: Array.from(sg, v => Math.round(v * 100)), e: Array.from(EVS[id], v => Math.round(v * 100)) };
  }
  return { out, nS, nB };
}

if (!isMainThread) parentPort.postMessage(solve(workerData.board, workerData.N));
else {
  const N = +process.argv[2] || 1000, t0 = Date.now(), only = process.argv[3];
  const list = only ? [only] : BOARDS;
  const res = await Promise.all(list.map(board => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { board, N } }); w.on('message', ok); w.on('error', no);
  })));
  for (const r of res) console.log(r.out.board, 'nS', r.nS, 'nB', r.nB, 'Ausnutzbarkeit', r.out.expl + '% Pot');
  if (!only) {
    fs.writeFileSync(DATA_DIR + '/flop-data.json', JSON.stringify({ tree: TREE, boards: res.map(r => r.out) }));
    console.log('fertig', (Date.now() - t0) / 1000, 's', fs.statSync(DATA_DIR + '/flop-data.json').size, 'bytes');
  }
}
