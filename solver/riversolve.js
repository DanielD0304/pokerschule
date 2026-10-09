// River-Solver (CFR+), exakt: Ranges aus dem Flop-Solver (SB C-Bet, BB Call, Turn Check-Check).
// Aufruf: node solver/riversolve.js [iter]   liest data/flop-data.json → data/river-data.json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import { cardFromStr as card, cardStr as cstr } from '../src/core/cards.js';
import { eval7 } from '../src/core/evaluator.js';
import { DATA_DIR } from './paths.js';

// Baum relativ zum Pot P, Einsatz pro Spieler vor dem River I0 = P/2
function buildTree(P) {
  const I0 = P / 2, r2 = x => Math.round(x * 100) / 100;
  const T = {}; const sd = (inv) => ({ t: 'sd', pot: r2(2 * inv), inv: r2(inv) });
  T.r_root = { p: 'BB', a: ['check', 'lead'], c: ['r_ip', 'r_vsLead'], amt: { lead: r2(P * .5) } };
  T.r_ip = { p: 'SB', a: ['check', 'b33', 'b75', 'b150'], c: ['t_xx', 'r_vs33', 'r_vs75', 'r_vs150'], amt: { b33: r2(P / 3), b75: r2(P * .75), b150: r2(P * 1.5) } };
  T.t_xx = sd(I0);
  for (const [k, f] of [['33', 1 / 3], ['75', .75], ['150', 1.5]]) {
    const b = r2(P * f), R = r2(3 * b);
    T['r_vs' + k] = { p: 'BB', a: ['fold', 'call', 'raise'], c: ['t_f' + k, 't_c' + k, 'r_vsR' + k], amt: { call: b, raise: R } };
    T['t_f' + k] = { t: 'fold', sb: r2(I0) };
    T['t_c' + k] = sd(I0 + b);
    T['r_vsR' + k] = { p: 'SB', a: ['fold', 'call'], c: ['t_fr' + k, 't_cr' + k], amt: { call: r2(R - b) } };
    T['t_fr' + k] = { t: 'fold', sb: r2(-(I0 + b)) };
    T['t_cr' + k] = sd(I0 + R);
  }
  const L = r2(P * .5), LR = r2(3 * L);
  T.r_vsLead = { p: 'SB', a: ['fold', 'call', 'raise'], c: ['t_fl', 't_cl', 'r_vsLR'], amt: { call: L, raise: LR } };
  T.t_fl = { t: 'fold', sb: r2(-I0) }; T.t_cl = sd(I0 + L);
  T.r_vsLR = { p: 'BB', a: ['fold', 'call'], c: ['t_flr', 't_clr'], amt: { call: r2(LR - L) } };
  T.t_flr = { t: 'fold', sb: r2(I0 + L) }; T.t_clr = sd(I0 + LR);
  return T;
}

function solve({ spot, N }) {
  const { boardStr, turn, river, sbW, bbW, combos, P, line } = spot;
  const board = [card(boardStr.slice(0, 2)), card(boardStr.slice(2, 4)), card(boardStr.slice(4, 6)), turn, river];
  const S = [], SW = [], B = [], BW = [];
  combos.forEach((c, i) => { const a = Math.floor(c / 52), b = c % 52; if (a === turn || b === turn || a === river || b === river) return;
    if (sbW[i] > .002) { S.push([a, b]); SW.push(sbW[i]); } if (bbW[i] > .002) { B.push([a, b]); BW.push(bbW[i]); } });
  const nS = S.length, nB = B.length, h7 = new Int32Array(7); for (let k = 0; k < 5; k++) h7[k + 2] = board[k];
  const rank = h => { h7[0] = h[0]; h7[1] = h[1]; return eval7(h7); };
  const rS = S.map(rank), rB = B.map(rank);
  const C = new Float64Array(nS * nB), E = new Float64Array(nS * nB);
  for (let s = 0; s < nS; s++) for (let b = 0; b < nB; b++) { const x = S[s], y = B[b];
    if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) { C[s * nB + b] = 1; E[s * nB + b] = rS[s] > rB[b] ? 1 : rS[s] === rB[b] ? .5 : 0; } }
  const TREE = buildTree(P);
  const mvS = (M, rb) => { const o = new Float64Array(nS); for (let s = 0; s < nS; s++) { let v = 0; const k = s * nB; for (let b = 0; b < nB; b++) v += M[k + b] * rb[b]; o[s] = v; } return o; };
  const mvB = (M, rs) => { const o = new Float64Array(nB); for (let s = 0; s < nS; s++) { const w = rs[s]; if (!w) continue; const k = s * nB; for (let b = 0; b < nB; b++) o[b] += M[k + b] * w; } return o; };
  function term(t, rs, rb) {
    const cS = mvS(C, rb), cB = mvB(C, rs), uS = new Float64Array(nS), uB = new Float64Array(nB);
    if (t.t === 'fold') { for (let s = 0; s < nS; s++) uS[s] = t.sb * cS[s]; for (let b = 0; b < nB; b++) uB[b] = -t.sb * cB[b]; return [uS, uB]; }
    const eS = mvS(E, rb), eB = mvB(E, rs);
    for (let s = 0; s < nS; s++) uS[s] = t.pot * eS[s] - t.inv * cS[s];
    for (let b = 0; b < nB; b++) uB[b] = -(t.pot * eB[b] - t.inv * cB[b]);
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
    if (avg) { const norm = p ? mvB(C, rs) : mvS(C, rb); const ev = new Float64Array(m * A);
      for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) ev[h * A + a] = norm[h] > 1e-9 ? ua[a][h] / norm[h] : 0; EVS[id] = ev; return [uS, uB]; }
    for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) { const k = h * A + a; R[id][k] = Math.max(0, R[id][k] + ua[a][h] - u[h]); SS[id][k] += it * my[h] * sg[k]; }
    return [uS, uB];
  }
  const rs0 = Float64Array.from(SW), rb0 = Float64Array.from(BW);
  for (let it = 1; it <= N; it++) { walk('r_root', rs0, rb0, it, false); walk('r_root', rs0, rb0, it, false); }
  walk('r_root', rs0, rb0, 0, true);
  // Exploitability-Schätzung über Best Response
  function br(id, p, rs, rb) { // Wert des Best Responders p (Vektor), Gegner spielt Durchschnitt
    const n = TREE[id]; if (n.t) { const [a, b] = term(n, rs, rb); return p ? b : a; }
    const q = n.p === 'SB' ? 0 : 1, A = n.a.length;
    if (q === p) { let best = null; for (let a = 0; a < A; a++) { const v = br(n.c[a], p, rs, rb); best = best ? best.map((x, h) => Math.max(x, v[h])) : v; } return best; }
    const m = q ? nB : nS, sg = sigma(id, m, A, true); let acc = null;
    for (let a = 0; a < A; a++) { const my = q ? rb : rs, r2 = new Float64Array(m); for (let h = 0; h < m; h++) r2[h] = my[h] * sg[h * A + a];
      const v = q ? br(n.c[a], p, rs, r2) : br(n.c[a], p, r2, rb); acc = acc ? acc.map((x, h) => x + v[h]) : Array.from(v); }
    return acc; }
  const brS = br('r_root', 0, rs0, rb0), brB = br('r_root', 1, rs0, rb0);
  const [eqS, eqB] = walk('r_root', rs0, rb0, 0, true);
  const tot = rs0.reduce((x, y, s) => x + y * mvS(C, rb0)[s], 0);
  const gainS = brS.reduce((x, v, s) => x + rs0[s] * v, 0) - eqS.reduce((x, v, s) => x + rs0[s] * v, 0);
  const gainB = brB.reduce((x, v, b) => x + rb0[b] * v, 0) - eqB.reduce((x, v, b) => x + rb0[b] * v, 0);
  const expl = (gainS + gainB) / 2 / tot / P * 100; // % des Pots
  const out = { board: boardStr + cstr(turn) + cstr(river), P, line, tree: TREE, expl: +expl.toFixed(3),
    sb: { c: S.map(([a, b]) => a * 52 + b), w: SW.map(w => Math.round(w * 1000)) }, bb: { c: B.map(([a, b]) => a * 52 + b), w: BW.map(w => Math.round(w * 1000)) }, n: {} };
  for (const [id, n] of Object.entries(TREE)) if (!n.t) { const m = n.p === 'SB' ? nS : nB, A = n.a.length, sg = sigma(id, m, A, true);
    out.n[id] = { s: Array.from(sg, v => Math.round(v * 100)), e: Array.from(EVS[id], v => Math.round(v * 100)) }; }
  const freq = {}; const reach = { r_root: [rs0, rb0] };
  for (const id of ['r_root', 'r_ip', 'r_vsLead', 'r_vs33', 'r_vs75', 'r_vs150']) { const n = TREE[id]; if (!reach[id]) continue; const p = n.p === 'SB' ? 0 : 1, A = n.a.length, sg = sigma(id, p ? nB : nS, A, true), rr = reach[id][p];
    const t = new Float64Array(A); let w = 0; for (let h = 0; h < rr.length; h++) { w += rr[h]; for (let a = 0; a < A; a++) t[a] += rr[h] * sg[h * A + a]; }
    freq[id] = n.a.map((a, x) => a + ' ' + (t[x] / w * 100).toFixed(0)).join(' ');
    n.c.forEach((c, a) => { if (!TREE[c].t) { const nr = [Float64Array.from(reach[id][0]), Float64Array.from(reach[id][1])]; for (let h = 0; h < nr[p].length; h++) nr[p][h] *= sg[h * A + a]; reach[c] = nr; } }); }
  return { out, freq, nS, nB, expl };
}

if (!isMainThread) parentPort.postMessage(solve(workerData));
else {
  const N = +process.argv[2] || 1500, t0 = Date.now();
  const FD = JSON.parse(fs.readFileSync(DATA_DIR + '/flop-data.json', 'utf8'));
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const spots = [];
  for (const B of FD.boards) {
    // Linie: BB checkt, SB setzt (häufigere Größe), BB callt
    const ip = B.n.f_ip, root = B.n.f_root;
    let f33 = 0, f75 = 0; B.sb.c.forEach((c, i) => { f33 += B.sb.w[i] * ip.s[i * 3 + 1]; f75 += B.sb.w[i] * ip.s[i * 3 + 2]; });
    const big = f75 >= f33, ai = big ? 2 : 1, vs = big ? B.n.f_vsB75 : B.n.f_vsB33, P = big ? 12.5 : 8.3;
    const map = new Map(); const get = c => { if (!map.has(c)) map.set(c, { sb: 0, bb: 0 }); return map.get(c); };
    B.sb.c.forEach((c, i) => get(c).sb = B.sb.w[i] / 1000 * ip.s[i * 3 + ai] / 100);
    B.bb.c.forEach((c, i) => get(c).bb = B.bb.w[i] / 1000 * root.s[i * 2] / 100 * vs.s[i * 3 + 1] / 100);
    const combos = [...map.keys()], sbW = combos.map(c => map.get(c).sb), bbW = combos.map(c => map.get(c).bb);
    const used = new Set([0, 2, 4].map(k => card(B.board.slice(k, k + 2))));
    for (let r = 0; r < 2; r++) {
      let t, rv; do { t = (rnd() * 52) | 0; rv = (rnd() * 52) | 0; } while (used.has(t) || used.has(rv) || t === rv);
      spots.push({ boardStr: B.board, turn: t, river: rv, sbW, bbW, combos, P, line: big ? 'b75' : 'b33' });
    }
  }
  Promise.all(spots.map(spot => new Promise((ok, no) => { const w = new Worker(new URL(import.meta.url), { workerData: { spot, N } }); w.on('message', ok); w.on('error', no); })))
    .then(res => {
      for (const r of res) console.log(r.out.board, 'P', r.out.P, 'nS', r.nS, 'nB', r.nB, 'expl', r.expl.toFixed(2) + '%pot', JSON.stringify(r.freq));
      fs.writeFileSync(DATA_DIR + '/river-data.json', JSON.stringify({ spots: res.map(r => r.out) }));
      console.log('fertig', (Date.now() - t0) / 1000, 's', fs.statSync(DATA_DIR + '/river-data.json').size, 'bytes');
    });
}
