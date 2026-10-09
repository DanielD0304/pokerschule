// Heads-up-Preflop mit 100 BB (CFR+). Vereinfachter Baum aus data/hu-tree.json, Postflop über Equity-Realisierung.
// Aufruf: node solver/cfr.js [iter]   liest data/pf-data.json → data/hu-strat.json
import fs from 'node:fs';
import { CMB, labelId } from '../src/core/cards.js';
import { makeTables } from '../src/core/preflop.js';
import { fR } from '../src/core/hutree.js';
import { DATA_DIR } from './paths.js';

const { EQ, CPT } = makeTables(JSON.parse(fs.readFileSync(DATA_DIR + '/pf-data.json', 'utf8')));
const TREE = JSON.parse(fs.readFileSync(DATA_DIR + '/hu-tree.json', 'utf8'));

// Auszahlung für SB mit Klasse i gegen BB mit Klasse j
function payoffSB(t, i, j) {
  if (t.t === 'fold') return t.sb;
  if (t.t === 'sd') return t.pot * fR(EQ[i][j], t.d) - t.inv;
  return t.pot * EQ[i][j] - t.inv; // all-in
}
const TM = {};
for (const [id, n] of Object.entries(TREE)) if (n.t) {
  const M = Array.from({ length: 169 }, () => new Float64Array(169));
  for (let i = 0; i < 169; i++) for (let j = 0; j < 169; j++) M[i][j] = payoffSB(n, i, j);
  TM[id] = M;
}

const R = {}, SS = {};
for (const [id, n] of Object.entries(TREE)) if (!n.t) {
  R[id] = Array.from({ length: 169 }, () => new Float64Array(n.a.length));
  SS[id] = Array.from({ length: 169 }, () => new Float64Array(n.a.length));
}
function strat(id, h) { const r = R[id][h], n = r.length; let s = 0; for (let a = 0; a < n; a++) s += r[a]; const o = new Float64Array(n); for (let a = 0; a < n; a++) o[a] = s > 0 ? r[a] / s : 1 / n; return o; }

// gibt [uSB(169), uBB(169)] zurück (kontrafaktische Werte)
function cfr(id, rs, rb, it) {
  const n = TREE[id];
  if (n.t) {
    const M = TM[id], uS = new Float64Array(169), uB = new Float64Array(169);
    for (let i = 0; i < 169; i++) { let s = 0; for (let j = 0; j < 169; j++) s += CPT[i][j] * rb[j] * M[i][j]; uS[i] = s; }
    for (let j = 0; j < 169; j++) { let s = 0; for (let i = 0; i < 169; i++) s += CPT[j][i] * rs[i] * -M[i][j]; uB[j] = s; }
    return [uS, uB];
  }
  const p = n.p === 'SB' ? 0 : 1, A = n.a.length;
  const sig = Array.from({ length: 169 }, (_, h) => strat(id, h));
  const uS = new Float64Array(169), uB = new Float64Array(169), ua = [];
  for (let a = 0; a < A; a++) {
    const r2 = new Float64Array(169), my = p === 0 ? rs : rb;
    for (let h = 0; h < 169; h++) r2[h] = my[h] * sig[h][a];
    const [cs, cb] = p === 0 ? cfr(n.c[a], r2, rb, it) : cfr(n.c[a], rs, r2, it);
    ua.push(p === 0 ? cs : cb);
    for (let h = 0; h < 169; h++) { if (p === 0) { uS[h] += sig[h][a] * cs[h]; uB[h] += cb[h]; } else { uB[h] += sig[h][a] * cb[h]; uS[h] += cs[h]; } }
  }
  const u = p === 0 ? uS : uB, my = p === 0 ? rs : rb;
  for (let h = 0; h < 169; h++) for (let a = 0; a < A; a++) {
    R[id][h][a] = Math.max(0, R[id][h][a] + ua[a][h] - u[h]);
    SS[id][h][a] += it * my[h] * sig[h][a];
  }
  return [uS, uB];
}
const N = +process.argv[2] || 3000, ones = new Float64Array(169).fill(1);
for (let it = 1; it <= N; it++) { cfr('root', ones, ones, it); cfr('root', ones, ones, it); }
const out = {};
for (const id of Object.keys(SS)) out[id] = SS[id].map(r => { const s = r.reduce((x, y) => x + y, 0); return Array.from(r, v => +(s > 0 ? v / s : 1 / r.length).toFixed(3)); });
fs.writeFileSync(DATA_DIR + '/hu-strat.json', JSON.stringify(out));

// Kontrolle: reichweitengewichtete Häufigkeiten
const reach = { root: [CMB.map(c => c.length), CMB.map(c => c.length)] };
for (const id of ['root', 'vsOpen', 'vs3b', 'vs4b', 'vsJam']) {
  const n = TREE[id], p = n.p === 'SB' ? 0 : 1, rr = reach[id][p];
  const tot = new Float64Array(n.a.length); let w = 0;
  for (let h = 0; h < 169; h++) { w += rr[h]; for (let a = 0; a < n.a.length; a++) tot[a] += rr[h] * out[id][h][a]; }
  console.log(id.padEnd(7), n.p, n.a.map((a, x) => a + ' ' + (tot[x] / w * 100).toFixed(1) + '%').join(' | '));
  n.c.forEach((c, a) => { if (!TREE[c].t) { const nr = [reach[id][0].slice(), reach[id][1].slice()]; for (let h = 0; h < 169; h++) nr[p][h] *= out[id][h][a]; reach[c] = nr; } });
}
const show = (id, hs) => console.log(id, hs.map(h => h + ':' + out[id][labelId(h)].join('/')).join('  '));
show('root', ['72o', 'K2o', 'AA']);
show('vsOpen', ['AA', 'KQo', '72o']);
