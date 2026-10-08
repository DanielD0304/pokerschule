// Heads-up 100 BB Preflop-Solver (CFR+), vereinfachter Baum, Postflop über Equity-Realisierung
const fs = require('fs');
const D = JSON.parse(fs.readFileSync(__dirname + '/pf-data.json', 'utf8'));
const bin = Buffer.from(D.eq, 'base64');
const EQ = Array.from({ length: 169 }, () => new Float64Array(169)); let k = 0;
for (let a = 0; a < 169; a++) for (let b = a; b < 169; b++) { const e = bin.readUInt16LE(2 * k++) / 65535; EQ[a][b] = e; EQ[b][a] = 1 - e; }
for (let a = 0; a < 169; a++) EQ[a][a] = .5;
function combosOf(id) { const i = Math.floor(id / 13), j = id % 13, o = [];
  if (i === j) { for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) o.push([i * 4 + a, i * 4 + b]); }
  else if (i > j) { for (let s = 0; s < 4; s++) o.push([i * 4 + s, j * 4 + s]); }
  else { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) o.push([j * 4 + a, i * 4 + b]); } return o; }
const CMB = Array.from({ length: 169 }, (_, k) => combosOf(k));
const CPT = CMB.map(A => { const r = new Float64Array(169); for (let b = 0; b < 169; b++) { let s = 0; for (const x of A) for (const y of CMB[b]) if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) s++; r[b] = s / A.length; } return r; });

const TREE = JSON.parse(fs.readFileSync(__dirname + '/tree.json', 'utf8'));
const f = (eq, d) => eq + d * 4 * eq * (1 - eq); // Anteil des Spielers in Position (SB)
// Auszahlung für SB, Hand i (SB) gegen j (BB)
function payoffSB(t, i, j) {
  if (t.t === 'fold') return t.sb;
  if (t.t === 'sd') return t.pot * f(EQ[i][j], t.d) - t.inv;
  return t.pot * EQ[i][j] - t.inv; // all-in
}
// Terminal-Matrizen vorab
const TM = {};
for (const [id, n] of Object.entries(TREE)) if (n.t) { const M = Array.from({ length: 169 }, () => new Float64Array(169)); for (let i = 0; i < 169; i++) for (let j = 0; j < 169; j++) M[i][j] = payoffSB(n, i, j); TM[id] = M; }

const R = {}, SS = {};
for (const [id, n] of Object.entries(TREE)) if (!n.t) { R[id] = Array.from({ length: 169 }, () => new Float64Array(n.a.length)); SS[id] = Array.from({ length: 169 }, () => new Float64Array(n.a.length)); }
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
fs.writeFileSync(__dirname + '/hu-strat.json', JSON.stringify(out));
// Kontrolle: reichweitengewichtete Häufigkeiten
const lab = id => { const i = Math.floor(id / 13), j = id % 13, Rr = '23456789TJQKA'; return i === j ? Rr[i] + Rr[j] : i > j ? Rr[i] + Rr[j] + 's' : Rr[j] + Rr[i] + 'o'; };
const reach = { root: [Array.from({length:169},(_,h)=>CMB[h].length), Array.from({length:169},(_,h)=>CMB[h].length)] };
const order = ['root','vsOpen','vs3b','vs4b','vsJam'];
for (const id of order) { const n = TREE[id], p = n.p === 'SB' ? 0 : 1, rr = reach[id][p];
  const tot = new Float64Array(n.a.length); let w = 0;
  for (let h = 0; h < 169; h++) { w += rr[h]; for (let a = 0; a < n.a.length; a++) tot[a] += rr[h] * out[id][h][a]; }
  console.log(id.padEnd(7), n.p, n.a.map((a, x) => a + ' ' + (tot[x] / w * 100).toFixed(1) + '%').join(' | '));
  n.c.forEach((c, a) => { if (!TREE[c].t) { const nr = [reach[id][0].slice(), reach[id][1].slice()]; for (let h = 0; h < 169; h++) nr[p][h] *= out[id][h][a]; reach[c] = nr; } });
}
const show = (id, hs) => console.log(id, hs.map(h => { const R2 = '23456789TJQKA', hi = R2.indexOf(h[0]), lo = R2.indexOf(h[1]); const x = hi === lo ? hi * 14 : h[2] === 's' ? hi * 13 + lo : lo * 13 + hi; return h + ':' + out[id][x].join('/'); }).join('  '));
show('root', ['72o', '93o', '83o', 'K2o', 'J4o', 'Q3o']);
show('vsOpen', ['AA', 'KQo', 'A5s', '72o', '94o', 'T7s', 'J2o']);
show('vs3b', ['AA', 'KK', 'AQo', 'A5s', 'JTs', 'K9o', '76s']);
show('vs4b', ['AA', 'KK', 'QQ', 'AKo', 'AQs', 'A5s', 'JJ']);
show('vsJam', ['QQ', 'JJ', 'TT', 'AKo', 'AQs', 'A5s']);
