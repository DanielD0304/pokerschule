// Turn-Solver (CFR+), exakt über alle River-Karten: Single-Raised-Pot, 100 BB, Ranges aus dem Flop-Solver
// (BB checkt, SB setzt die häufigere C-Bet-Größe, BB callt). Gelöst wird der Turn samt River-Spiel auf jeder der
// 44 möglichen River-Karten; gespeichert werden nur die Turn-Entscheidungen (Roadmap 04, B-03).
// Aufruf: node solver/turnsolve.js [iter] [board | --fehlende]   liest data/flop/ → data/turn/<spot>.json + data/turn/index.json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';
import { cardFromStr as card, cardStr as cstr } from '../src/core/cards.js';
import { eval7 } from '../src/core/evaluator.js';
import { FLOP_DIR, DATA_DIR } from './paths.js';

export const TURN_DIR = DATA_DIR + '/turn';
const STACK = 100;
const r2 = x => Math.round(x * 100) / 100;
/**
 * „Zittern“: Beim Weitergeben der Reichweite spielt jeder Spieler jede Aktion mit mindestens ε / Zahl der Aktionen.
 * Sonst bekommen Knoten, die der Gegner im Gleichgewicht nie erreicht (z. B. BB führt), kein Lernsignal, und die
 * Strategie dort bleibt unsinnig (etwa Fold mit zwei Paaren gegen einen Lead).
 * ε beginnt bei EPS0 und sinkt in der ersten Hälfte der Iterationen linear auf 0; die zweite Hälfte rechnet exakt.
 * Seltene Knoten behalten so eine vernünftige Antwort, ohne dass das Gleichgewicht dauerhaft verzerrt wird.
 * Die EVs je Aktion werden mit EPS_EV ausgewertet (an seltenen Knoten sonst Division durch fast 0), die Lösungsgüte exakt.
 */
export const EPS0 = +(process.env.TURN_EPS ?? .05), EPS_EV = .005;
export const epsAt = (it, N) => EPS0 * Math.max(0, 1 - it / (N / 2));

/**
 * Setzbaum einer Straße. P: Pot zu Beginn, I0: Einsatz je Spieler bis dahin, pre: Präfix der Knoten (u Turn, v River),
 * end(inv): Endknoten, wenn beide gleich viel investiert haben und die Straße vorbei ist.
 * Einsätze sind auf den Reststack begrenzt; gleiche Größen nach der Begrenzung fallen zusammen, auf ein All-in gibt es kein Raise.
 */
export function buildStreet(P, I0, pre, end) {
  const T = {}, left = STACK - I0, cap = x => r2(Math.min(x, left));
  const id = s => pre + '_' + s;
  const sizes = [['b33', P / 3], ['b75', P * .75], ['b150', P * 1.5]].map(([k, x]) => [k, cap(x)])
    .filter(([, x], i, all) => x > 0 && all.findIndex(([, y]) => y === x) === i);
  const facing = (key, b, p, back) => {
    // p reagiert auf eine Bet b: Fold, Call, Raise auf das Dreifache (falls Stack übrig)
    const R = cap(3 * b), canRaise = b < left && R > b, k = id('vs' + key);
    const sbSign = p === 'BB' ? 1 : -1; // bei Fold von BB gewinnt SB
    T[k] = { p, a: canRaise ? ['fold', 'call', 'raise'] : ['fold', 'call'], c: [k + '_f', k + '_c', ...(canRaise ? [id('vsR' + key)] : [])], amt: { call: b, ...(canRaise ? { raise: R } : {}) } };
    T[k + '_f'] = { t: 'fold', sb: r2(sbSign * I0) };
    T[k + '_c'] = end(r2(I0 + b));
    if (canRaise) {
      const q = back, kr = id('vsR' + key);
      T[kr] = { p: q, a: ['fold', 'call'], c: [kr + '_f', kr + '_c'], amt: { call: r2(R - b) } };
      T[kr + '_f'] = { t: 'fold', sb: r2(-sbSign * (I0 + b)) };
      T[kr + '_c'] = end(r2(I0 + R));
    }
  };
  if (left <= 0) { T[id('root')] = end(I0); return T; }
  const lead = cap(P * .5);
  T[id('root')] = { p: 'BB', a: ['check', 'lead'], c: [id('ip'), id('vsLead')], amt: { lead } };
  T[id('ip')] = { p: 'SB', a: ['check', ...sizes.map(([k]) => k)], c: [id('xx'), ...sizes.map(([k]) => id('vs' + k.slice(1)))], amt: Object.fromEntries(sizes) };
  T[id('xx')] = end(I0);
  for (const [k, b] of sizes) facing(k.slice(1), b, 'BB', 'SB');
  facing('Lead', lead, 'SB', 'BB');
  return T;
}

/**
 * Turn-Baum mit River-Knoten an jedem Ende ohne Fold. Der River-Baum (tree) hängt nur vom investierten Betrag ab;
 * die Regrets gehören aber zur Turn-Linie (line = Endknoten auf dem Turn), denn zwei Linien mit gleichem Betrag
 * (z. B. Overbet-Call und Lead-Raise-Call) haben verschiedene Ranges.
 */
export function buildTurn(P) {
  const rivers = {};
  const T = buildStreet(P, P / 2, 'u', inv => {
    const tree = 'L' + Math.round(inv * 100);
    rivers[tree] ??= buildStreet(2 * inv, inv, 'v', i => ({ t: 'sd', pot: r2(2 * i), inv: i }));
    return { t: 'river', tree, inv };
  });
  for (const [id, n] of Object.entries(T)) if (n.t === 'river') n.line = id;
  return { T, rivers };
}

// ---------- Lösen ----------

function solve({ spot, N }) {
  const { flop, turn, sbW, bbW, combos, P, line } = spot;
  const board = [0, 2, 4].map(k => card(flop.slice(k, k + 2))).concat(turn);
  const S = [], SW = [], B = [], BW = [];
  combos.forEach((c, i) => {
    const a = Math.floor(c / 52), b = c % 52; if (a === turn || b === turn) return;
    if (sbW[i] > .002) { S.push([a, b]); SW.push(sbW[i]); }
    if (bbW[i] > .002) { B.push([a, b]); BW.push(bbW[i]); }
  });
  const nS = S.length, nB = B.length;
  const key = h => h[0] * 52 + h[1], idxB = new Map(B.map((h, i) => [key(h), i])), idxS = new Map(S.map((h, i) => [key(h), i]));
  const sameB = Int32Array.from(S, h => idxB.get(key(h)) ?? -1), sameS = Int32Array.from(B, h => idxS.get(key(h)) ?? -1);
  const used = new Set(board), rivers = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rivers.push(c);
  // Ränge je River-Karte, -1 wenn die Hand die Karte enthält; dazu Sortierung nach Rang
  const h7 = new Int32Array(7); for (let k = 0; k < 4; k++) h7[k + 2] = board[k];
  const RS = [], RB = [], OS = [], OB = [];
  for (const r of rivers) {
    h7[6] = r;
    const rank = hs => Int32Array.from(hs, h => { if (h[0] === r || h[1] === r) return -1; h7[0] = h[0]; h7[1] = h[1]; return eval7(h7); });
    const rs = rank(S), rb = rank(B);
    const order = arr => Int32Array.from([...arr.keys()].filter(i => arr[i] >= 0).sort((x, y) => arr[x] - arr[y]));
    RS.push(rs); RB.push(rb); OS.push(order(rs)); OB.push(order(rb));
  }
  const NR = rivers.length; // 48; je Paar von Händen sind 44 davon möglich
  const blockedS = rivers.map(r => Uint8Array.from(S, h => h[0] === r || h[1] === r)), blockedB = rivers.map(r => Uint8Array.from(B, h => h[0] === r || h[1] === r));

  // Summe der Gegner-Reichweite ohne Hände, die eine eigene Karte enthalten
  const cardSum = new Float64Array(52);
  function compat(own, oppH, oppR, same, out) {
    cardSum.fill(0); let tot = 0;
    for (let j = 0; j < oppH.length; j++) { const w = oppR[j]; if (!w) continue; tot += w; cardSum[oppH[j][0]] += w; cardSum[oppH[j][1]] += w; }
    for (let i = 0; i < own.length; i++) out[i] = tot - cardSum[own[i][0]] - cardSum[own[i][1]] + (same[i] >= 0 ? oppR[same[i]] : 0);
    return out;
  }
  // Gewinn- und Gleichstand-Anteil gegen die Gegner-Reichweite mit Blockern (sortierte Ränge, O(n) statt O(n²))
  const low = new Float64Array(52), eq = new Float64Array(52);
  function showdown(own, ownRank, ownOrder, opp, oppRank, oppOrder, oppR, same, out) {
    low.fill(0); eq.fill(0); let lowT = 0, j = 0, g = 0, g0 = 0, gRank = -2, eqT = 0;
    for (let x = 0; x < ownOrder.length; x++) {
      const i = ownOrder[x], rk = ownRank[i];
      while (j < oppOrder.length && oppRank[oppOrder[j]] < rk) { const o = oppOrder[j++], w = oppR[o]; if (w) { lowT += w; low[opp[o][0]] += w; low[opp[o][1]] += w; } }
      if (rk !== gRank) {
        // nur die Karten der vorigen Gruppe zurücksetzen statt aller 52 (bei Hunderten Gruppen spürbar schneller)
        for (let q = g0; q < g; q++) { const o = oppOrder[q]; eq[opp[o][0]] = 0; eq[opp[o][1]] = 0; }
        gRank = rk; eqT = 0; g0 = j;
        for (g = j; g < oppOrder.length && oppRank[oppOrder[g]] === rk; g++) { const o = oppOrder[g], w = oppR[o]; if (w) { eqT += w; eq[opp[o][0]] += w; eq[opp[o][1]] += w; } }
      }
      const h = own[i], win = lowT - low[h[0]] - low[h[1]];
      const tie = eqT - eq[h[0]] - eq[h[1]] + (same[i] >= 0 && oppRank[same[i]] === rk ? oppR[same[i]] : 0);
      out[i] = win + .5 * tie;
    }
    return out;
  }

  const { T, rivers: RT } = buildTurn(P);
  // Regrets und Strategiesummen: Turn-Knoten einmal, River-Knoten je Linie und River-Karte
  const R = new Map(), SS = new Map();
  const slot = (k, m, A) => { if (!R.has(k)) { R.set(k, new Float32Array(m * A)); SS.set(k, new Float32Array(m * A)); } return k; };
  const sigma = (k, m, A, avg) => {
    const src = avg ? SS.get(k) : R.get(k), o = new Float64Array(m * A);
    for (let h = 0; h < m; h++) { let s = 0; for (let a = 0; a < A; a++) s += src[h * A + a]; for (let a = 0; a < A; a++) o[h * A + a] = s > 0 ? src[h * A + a] / s : 1 / A; }
    return o;
  };
  const cS = new Float64Array(nS), cB = new Float64Array(nB), wS = new Float64Array(nS), wB = new Float64Array(nB);
  function term(n, ri, rs, rb) {
    const uS = new Float64Array(nS), uB = new Float64Array(nB);
    compat(S, B, rb, sameB, cS); compat(B, S, rs, sameS, cB);
    if (n.t === 'fold') { for (let s = 0; s < nS; s++) uS[s] = n.sb * cS[s]; for (let b = 0; b < nB; b++) uB[b] = -n.sb * cB[b]; return [uS, uB]; }
    showdown(S, RS[ri], OS[ri], B, RB[ri], OB[ri], rb, sameB, wS); showdown(B, RB[ri], OB[ri], S, RS[ri], OS[ri], rs, sameS, wB);
    for (let s = 0; s < nS; s++) uS[s] = n.pot * wS[s] - n.inv * cS[s];
    for (let b = 0; b < nB; b++) uB[b] = n.pot * wB[b] - n.inv * cB[b];
    return [uS, uB];
  }
  const EVS = {};
  // mode: 'cfr0'/'cfr1' (Regrets von SB bzw. BB fortschreiben), 'avg' (Durchschnitt mit Zittern auswerten, EVs merken),
  // 'val' (Durchschnitt ohne Zittern, für die Lösungsgüte), ['br', p] (Best Response von p, ohne Zittern)
  function walk(tree, id, ri, rs, rb, it, mode, line = null) {
    const n = tree[id];
    if (n.t === 'river') {
      const uS = new Float64Array(nS), uB = new Float64Array(nB), RTl = RT[n.tree];
      for (let r = 0; r < NR; r++) {
        const bS = blockedS[r], bB = blockedB[r], ms = Float64Array.from(rs, (v, i) => bS[i] ? 0 : v), mb = Float64Array.from(rb, (v, i) => bB[i] ? 0 : v);
        const [vs, vb] = walk(RTl, 'v_root', r, ms, mb, it, mode, n.line);
        for (let s = 0; s < nS; s++) if (!bS[s]) uS[s] += vs[s] / 44;
        for (let b = 0; b < nB; b++) if (!bB[b]) uB[b] += vb[b] / 44;
      }
      return [uS, uB];
    }
    if (n.t) return term(n, ri, rs, rb);
    const p = n.p === 'SB' ? 0 : 1, m = p ? nB : nS, A = n.a.length;
    const k = ri < 0 ? id : `${line}|${ri}|${id}`;
    slot(k, m, A);
    const br = Array.isArray(mode) && mode[1] === p;
    const cfr = mode === 'cfr0' || mode === 'cfr1';
    const sg = sigma(k, m, A, !cfr), eps = cfr ? epsAt(it, N) : mode === 'avg' ? EPS_EV : 0;
    const uS = new Float64Array(nS), uB = new Float64Array(nB), ua = [];
    for (let a = 0; a < A; a++) {
      const my = p ? rb : rs, rr = new Float64Array(m); for (let h = 0; h < m; h++) rr[h] = br ? my[h] : my[h] * (sg[h * A + a] * (1 - eps) + eps / A);
      const [cs, cb] = p ? walk(tree, n.c[a], ri, rs, rr, it, mode, line) : walk(tree, n.c[a], ri, rr, rb, it, mode, line);
      ua.push(p ? cb : cs);
      if (br) continue;
      for (let h = 0; h < nS; h++) uS[h] += p ? cs[h] : sg[h * A + a] * cs[h];
      for (let h = 0; h < nB; h++) uB[h] += p ? sg[h * A + a] * cb[h] : cb[h];
    }
    if (br) { // beste Aktion je Hand; der andere Vektor stammt aus dem ersten Ast (für den Best Responder egal)
      const u = new Float64Array(m); for (let h = 0; h < m; h++) { let v = -Infinity; for (let a = 0; a < A; a++) v = Math.max(v, ua[a][h]); u[h] = v; }
      return p ? [new Float64Array(nS), u] : [u, new Float64Array(nB)];
    }
    if (mode === 'avg') {
      if (ri < 0) { // EV je Aktion auf dem Turn, je Hand normiert auf die kompatible Gegner-Reichweite
        const norm = p ? compat(B, S, rs, sameS, new Float64Array(nB)) : compat(S, B, rb, sameB, new Float64Array(nS));
        const ev = new Float64Array(m * A); for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) ev[h * A + a] = norm[h] > 1e-9 ? ua[a][h] / norm[h] : 0;
        EVS[id] = ev;
      }
      return [uS, uB];
    }
    if (cfr && mode === 'cfr' + p) {
      const u = p ? uB : uS, my = p ? rb : rs, Rk = R.get(k), Sk = SS.get(k);
      for (let h = 0; h < m; h++) for (let a = 0; a < A; a++) { const x = h * A + a; Rk[x] = Math.max(0, Rk[x] + ua[a][h] - u[h]); Sk[x] += it * my[h] * sg[x]; }
    }
    return [uS, uB];
  }
  const rs0 = Float64Array.from(SW), rb0 = Float64Array.from(BW);
  for (let it = 1; it <= N; it++) { walk(T, 'u_root', -1, rs0, rb0, it, 'cfr0'); walk(T, 'u_root', -1, rs0, rb0, it, 'cfr1'); }
  walk(T, 'u_root', -1, rs0, rb0, 0, 'avg'); // EVs je Aktion (gegen leicht zitternde Gegner, auch an seltenen Knoten stabil)
  const [vS, vB] = walk(T, 'u_root', -1, rs0, rb0, 0, 'val');
  // Lösungsgüte: Gewinn eines perfekten Gegenspielers in % des Pots
  const brS = walk(T, 'u_root', -1, rs0, rb0, 0, ['br', 0])[0], brB = walk(T, 'u_root', -1, rs0, rb0, 0, ['br', 1])[1];
  const tot = rs0.reduce((x, y, s) => x + y * compat(S, B, rb0, sameB, new Float64Array(nS))[s], 0);
  const dot = (w, v) => w.reduce((x, y, i) => x + y * v[i], 0);
  const expl = ((dot(rs0, brS) - dot(rs0, vS)) + (dot(rb0, brB) - dot(rb0, vB))) / 2 / tot / P * 100;
  const out = {
    board: flop + cstr(turn), P, line, tree: T, expl: +expl.toFixed(3),
    sb: { c: S.map(([a, b]) => a * 52 + b), w: SW.map(w => Math.round(w * 1000)) },
    bb: { c: B.map(([a, b]) => a * 52 + b), w: BW.map(w => Math.round(w * 1000)) }, n: {},
  };
  for (const [id, n] of Object.entries(T)) if (!n.t) {
    const m = n.p === 'SB' ? nS : nB, A = n.a.length, sg = sigma(id, m, A, true);
    out.n[id] = { s: Array.from(sg, v => Math.round(v * 100)), e: Array.from(EVS[id], v => Math.round(v * 100)) };
  }
  return { out, nS, nB };
}

// ---------- Spots aus den Flop-Lösungen ----------

/** Ranges nach der Flop-Linie BB Check, SB C-Bet (häufigere Größe), BB Call. */
export function turnRanges(B) {
  const ip = B.n.f_ip, root = B.n.f_root;
  let f33 = 0, f75 = 0; B.sb.c.forEach((c, i) => { f33 += B.sb.w[i] * ip.s[i * 3 + 1]; f75 += B.sb.w[i] * ip.s[i * 3 + 2]; });
  const big = f75 >= f33, ai = big ? 2 : 1, vs = big ? B.n.f_vsB75 : B.n.f_vsB33;
  const map = new Map(), get = c => { if (!map.has(c)) map.set(c, { sb: 0, bb: 0 }); return map.get(c); };
  B.sb.c.forEach((c, i) => { get(c).sb = B.sb.w[i] / 1000 * ip.s[i * 3 + ai] / 100; });
  B.bb.c.forEach((c, i) => { get(c).bb = B.bb.w[i] / 1000 * root.s[i * 2] / 100 * vs.s[i * 3 + 1] / 100; });
  const combos = [...map.keys()];
  return { combos, sbW: combos.map(c => map.get(c).sb), bbW: combos.map(c => map.get(c).bb), P: big ? 12.5 : 8.3, line: big ? 'b75' : 'b33' };
}

if (!isMainThread) parentPort.postMessage(solve(workerData));
else if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const N = +process.argv[2] || 600, t0 = Date.now(), arg = process.argv[3];
  const index = JSON.parse(fs.readFileSync(FLOP_DIR + '/index.json', 'utf8'));
  // je Flop-Board eine Turn-Karte, reproduzierbar gezogen
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const spots = index.boards.map(m => {
    const B = JSON.parse(fs.readFileSync(`${FLOP_DIR}/${m.board}.json`, 'utf8'));
    const used = new Set([0, 2, 4].map(k => card(m.board.slice(k, k + 2))));
    let t; do t = (rnd() * 52) | 0; while (used.has(t));
    return { flop: m.board, turn: t, w: m.w, ...turnRanges(B) };
  });
  const run = spot => new Promise((ok, no) => { const w = new Worker(new URL(import.meta.url), { workerData: { spot, N } }); w.on('message', ok); w.on('error', no); });
  const name = s => s.flop + cstr(s.turn);
  if (arg && arg !== '--fehlende') {
    const s = spots.find(x => x.flop === arg || name(x) === arg);
    if (!s) throw new Error('Unbekanntes Board ' + arg);
    const r = await run(s);
    console.log(r.out.board, 'P', r.out.P, 'nS', r.nS, 'nB', r.nB, 'Ausnutzbarkeit', r.out.expl + '% Pot', Math.round((Date.now() - t0) / 1000) + ' s');
    if (process.argv.includes('--schreiben')) { fs.mkdirSync(TURN_DIR, { recursive: true }); fs.writeFileSync(`${TURN_DIR}/${r.out.board}.json`, JSON.stringify(r.out)); }
  } else {
    fs.mkdirSync(TURN_DIR, { recursive: true });
    const file = s => `${TURN_DIR}/${name(s)}.json`;
    const todo = spots.filter(s => arg !== '--fehlende' || !fs.existsSync(file(s)));
    const pool = Math.max(1, Math.min(todo.length, os.availableParallelism() - 1));
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: pool }, async () => {
      while (next < todo.length) {
        const r = await run(todo[next++]);
        fs.writeFileSync(`${TURN_DIR}/${r.out.board}.json`, JSON.stringify(r.out));
        console.log(`${++done}/${todo.length}`, r.out.board, 'P', r.out.P, 'nS', r.nS, 'nB', r.nB, 'Ausnutzbarkeit', r.out.expl + '% Pot', Math.round((Date.now() - t0) / 1000) + ' s');
      }
    }));
    const list = spots.map(s => { const d = JSON.parse(fs.readFileSync(file(s), 'utf8')); return { spot: name(s), flop: s.flop, w: s.w, P: d.P, line: d.line, expl: d.expl }; });
    fs.writeFileSync(TURN_DIR + '/index.json', JSON.stringify({ spots: list }));
    const bytes = spots.reduce((a, s) => a + fs.statSync(file(s)).size, 0);
    console.log('fertig', (Date.now() - t0) / 1000, 's,', list.length, 'Spots,', bytes, 'bytes');
  }
}
