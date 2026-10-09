// Automatisch kopiert aus src/core/evaluator.js (npm run functions:sync). Nicht hier ändern.
// Die einzige Handbewertung für App und Solver.
// eval7 bewertet 5 bis 7 Karten (Zahlen 0..51) und liefert einen Integer: höher = besser.
// Aufbau: Kategorie << 20 | Ränge in 4-Bit-Feldern ab Bit 16 abwärts.
import { RNAME, RONE } from './cards.js';

const STR = new Int8Array(8192), PC = new Uint8Array(8192);
for (let m = 0; m < 8192; m++) {
  const ext = (m << 1) | ((m >> 12) & 1); // Ass zusätzlich als niedrigste Karte (Wheel)
  let h = -1;
  for (let t = 13; t >= 4; t--) if (((ext >> (t - 4)) & 31) === 31) { h = t - 1; break; }
  STR[m] = h; // Rang-Index der höchsten Karte der Straße (3 = Wheel bis Fünf)
  let c = 0, x = m; while (x) { x &= x - 1; c++; } PC[m] = c;
}
const cnt = new Int8Array(13), sm = new Int32Array(4);

/** Die n höchsten Ränge aus mask, linksbündig ab Bit 16. */
function topBits(mask, n) {
  let v = 0, k = 0;
  for (let r = 12; r >= 0 && k < n; r--) if (mask & (1 << r)) { v = (v << 4) | r; k++; }
  return v << (4 * (5 - n));
}

export const CAT = ['Höchste Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];

export function eval7(c) {
  cnt.fill(0); sm.fill(0);
  let rm = 0;
  const n = c.length;
  for (let k = 0; k < n; k++) { const r = c[k] >> 2; cnt[r]++; sm[c[k] & 3] |= 1 << r; rm |= 1 << r; }
  let fl = 0;
  for (let s = 0; s < 4; s++) if (PC[sm[s]] >= 5) { const sf = STR[sm[s]]; if (sf >= 0) return (8 << 20) | sf; fl = sm[s]; }
  let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = cnt[r];
    if (k === 4) q = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  // B1: Der Kicker gehört an Bit 12, nicht an Bit 16 (dort steht der Vierling-Rang).
  if (q >= 0) return (7 << 20) | (q << 16) | (topBits(rm & ~(1 << q), 1) >> 4);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  if (fl) return (5 << 20) | topBits(fl, 5);
  const st = STR[rm]; if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (topBits(rm & ~(1 << t1), 2) >> 4);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (topBits(rm & ~(1 << p1) & ~(1 << p2), 1) >> 8);
  if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topBits(rm & ~(1 << p1), 3) >> 4);
  return topBits(rm, 5);
}

/** Bewertung für Kartenobjekte {r,s}. */
export const evalCards = cards => eval7(cards.map(c => (c.r - 2) * 4 + c.s));
export const compare = (a, b) => a - b;
export const category = score => score >> 20;

/** Score → [Kategorie, Ränge 2..14 in Wertungsreihenfolge]. */
export function toArray(score) {
  const cat = score >> 20, f = i => ((score >> (16 - 4 * i)) & 15) + 2;
  switch (cat) {
    case 8: case 4: return [cat, (score & 0xfffff) + 2];
    case 7: case 6: return [cat, f(0), f(1)];
    case 3: return [cat, f(0), f(1), f(2)];
    case 2: return [cat, f(0), f(1), f(2)];
    case 1: return [cat, f(0), f(1), f(2), f(3)];
    default: return [cat, f(0), f(1), f(2), f(3), f(4)];
  }
}

export function handName(score) {
  const sc = toArray(score);
  switch (sc[0]) {
    case 8: return sc[1] === 14 ? 'Royal Flush' : `Straight Flush bis ${RONE[sc[1]]}`;
    case 7: return `Vierling ${RNAME[sc[1]]}, Kicker ${RONE[sc[2]]}`;
    case 6: return `Full House, ${RNAME[sc[1]]} über ${RNAME[sc[2]]}`;
    case 5: return `Flush, ${RONE[sc[1]]} hoch`;
    case 4: return `Straße bis ${RONE[sc[1]]}`;
    case 3: return `Drilling ${RNAME[sc[1]]}`;
    case 2: return `Zwei Paare, ${RNAME[sc[1]]} und ${RNAME[sc[2]]}, Kicker ${RONE[sc[3]]}`;
    case 1: return `Paar ${RNAME[sc[1]]}, Kicker ${RONE[sc[2]]}`;
    default: return `${RONE[sc[1]]} hoch`;
  }
}

/** Beste Fünferkombination aus 5–7 Kartenobjekten, für die Anzeige. */
export function best5(cards) {
  const n = cards.length, ints = cards.map(c => (c.r - 2) * 4 + c.s);
  let best = -1, bestIdx = null;
  const rec = (start, depth, pick) => {
    if (depth === 5) { const s = eval7(pick.map(i => ints[i])); if (s > best) { best = s; bestIdx = pick.slice(); } return; }
    for (let i = start; i <= n - (5 - depth); i++) { pick.push(i); rec(i + 1, depth + 1, pick); pick.pop(); }
  };
  rec(0, 0, []);
  return { score: best, cards: bestIdx.map(i => cards[i]) };
}
