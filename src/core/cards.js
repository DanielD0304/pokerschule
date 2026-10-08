// Karten: als Objekt {r: 2..14, s: 0..3} für die Oberfläche, als Zahl 0..51 (Rang-Index * 4 + Farbe) für Rechnungen.
export const RANKS = '23456789TJQKA';
export const SUITS = ['s', 'h', 'd', 'c'];
export const SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const SUIT_NAME = { s: 'Pik', h: 'Herz', d: 'Karo', c: 'Kreuz' };
export const RNAME = { 2: 'Zweien', 3: 'Dreien', 4: 'Vieren', 5: 'Fünfen', 6: 'Sechsen', 7: 'Siebenen', 8: 'Achten', 9: 'Neunen', 10: 'Zehnen', 11: 'Buben', 12: 'Damen', 13: 'Könige', 14: 'Asse' };
export const RONE = { 2: 'Zwei', 3: 'Drei', 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht', 9: 'Neun', 10: 'Zehn', 11: 'Bube', 12: 'Dame', 13: 'König', 14: 'Ass' };

export const rc = r => RANKS[r - 2];
export const cint = c => (c.r - 2) * 4 + c.s;
export const icard = n => ({ r: (n >> 2) + 2, s: n & 3 });
/** "As Kd" → [{r:14,s:0},{r:13,s:2}] */
export const parse = str => str.trim().split(/\s+/).map(t => ({ r: RANKS.indexOf(t[0]) + 2, s: SUITS.indexOf(t[1]) }));
/** "As" → 48 */
export const cardFromStr = t => RANKS.indexOf(t[0]) * 4 + SUITS.indexOf(t[1]);
export const cardStr = n => RANKS[n >> 2] + SUITS[n & 3];

/** Gemischtes Deck als Kartenobjekte. */
export function deck(rng = Math.random) {
  const d = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// --- 169 Starthand-Klassen: id = i*13+j; i==j Paar, i>j suited (hoch i), i<j offsuit (hoch j) ---
export function classOfInts(a, b) {
  const x = a >> 2, y = b >> 2, hi = Math.max(x, y), lo = Math.min(x, y);
  if (x === y) return x * 14;
  return (a & 3) === (b & 3) ? hi * 13 + lo : lo * 13 + hi;
}
export const cid = h => classOfInts(cint(h[0]), cint(h[1]));
export function idLabel(id) {
  const i = Math.floor(id / 13), j = id % 13;
  return i === j ? RANKS[i] + RANKS[j] : i > j ? RANKS[i] + RANKS[j] + 's' : RANKS[j] + RANKS[i] + 'o';
}
export function labelId(l) {
  const h = RANKS.indexOf(l[0]), lo = RANKS.indexOf(l[1]);
  return h === lo ? h * 14 : l[2] === 's' ? h * 13 + lo : lo * 13 + h;
}
export function combosOf(id) {
  const i = Math.floor(id / 13), j = id % 13, o = [];
  if (i === j) { for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) o.push([i * 4 + a, i * 4 + b]); }
  else if (i > j) { for (let s = 0; s < 4; s++) o.push([i * 4 + s, j * 4 + s]); }
  else { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) o.push([j * 4 + a, i * 4 + b]); }
  return o;
}
export const CMB = Array.from({ length: 169 }, (_, k) => combosOf(k));
/** Durchschnittliche Zahl kompatibler Combos von b, wenn eine konkrete Combo von a gehalten wird. */
export function compatMatrix() {
  return CMB.map(A => {
    const row = new Float64Array(169);
    for (let b = 0; b < 169; b++) {
      let s = 0;
      for (const x of A) for (const y of CMB[b]) if (x[0] !== y[0] && x[0] !== y[1] && x[1] !== y[0] && x[1] !== y[1]) s++;
      row[b] = s / A.length;
    }
    return row;
  });
}
/** Label im 6-max-Quiz-Format ("AKs", "T9o", "77") für zwei Kartenobjekte. */
export function labelOf(c1, c2) {
  const [h, l] = c1.r >= c2.r ? [c1, c2] : [c2, c1];
  if (h.r === l.r) return rc(h.r) + rc(l.r);
  return rc(h.r) + rc(l.r) + (h.s === l.s ? 's' : 'o');
}
