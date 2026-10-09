// Referenz-Handbewertung, absichtlich anders gebaut als src/core/evaluator.js:
// Sie geht alle 21 Fünferkombinationen durch, sortiert die Ränge, zählt Gruppen und
// kodiert das Ergebnis als Zahl zur Basis 16 (Kategorie zuerst). Keine Bitmasken, keine Lookup-Tabellen.

const R = new Int32Array(5), S = new Int32Array(5), cnt = new Int32Array(15), grp = new Int32Array(5);

function rank5(c, i0, i1, i2, i3, i4) { // c: Karten 0..51
  const x0 = c[i0], x1 = c[i1], x2 = c[i2], x3 = c[i3], x4 = c[i4];
  R[0] = (x0 >> 2) + 2; R[1] = (x1 >> 2) + 2; R[2] = (x2 >> 2) + 2; R[3] = (x3 >> 2) + 2; R[4] = (x4 >> 2) + 2;
  S[0] = x0 & 3; S[1] = x1 & 3; S[2] = x2 & 3; S[3] = x3 & 3; S[4] = x4 & 3;
  // Ränge absteigend sortieren (Insertion Sort)
  for (let a = 1; a < 5; a++) { const v = R[a]; let b = a - 1; while (b >= 0 && R[b] < v) { R[b + 1] = R[b]; b--; } R[b + 1] = v; }
  const flush = S[0] === S[1] && S[1] === S[2] && S[2] === S[3] && S[3] === S[4];
  const distinct = R[0] !== R[1] && R[1] !== R[2] && R[2] !== R[3] && R[3] !== R[4];
  let straight = 0;
  if (distinct) { if (R[0] - R[4] === 4) straight = R[0]; else if (R[0] === 14 && R[1] === 5) straight = 5; }
  cnt.fill(0); for (let k = 0; k < 5; k++) cnt[R[k]]++;
  // Gruppen: zuerst nach Größe, dann nach Rang absteigend
  let g = 0, shape = 0; // Gruppengrößen als Ziffernfolge, z. B. 2111
  for (let size = 4; size >= 1; size--) for (let r = 14; r >= 2; r--) if (cnt[r] === size) { grp[g++] = r; shape = shape * 10 + size; }
  const enc = (cat, a = 0, b = 0, d = 0, e = 0, f = 0) => ((((((cat * 16 + a) * 16 + b) * 16 + d) * 16 + e) * 16) + f);
  if (straight && flush) return enc(8, straight);
  if (shape === 41) return enc(7, grp[0], grp[1]);
  if (shape === 32) return enc(6, grp[0], grp[1]);
  if (flush) return enc(5, R[0], R[1], R[2], R[3], R[4]);
  if (straight) return enc(4, straight);
  if (shape === 311) return enc(3, grp[0], grp[1], grp[2]);
  if (shape === 221) return enc(2, grp[0], grp[1], grp[2]);
  if (shape === 2111) return enc(1, grp[0], grp[1], grp[2], grp[3]);
  return enc(0, R[0], R[1], R[2], R[3], R[4]);
}
/** Beste Bewertung aus 7 Karten (0..51) als Zahl; Kategorie = Math.floor(x / 16^5). */
export function refEval7(c) {
  let best = -1;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let d = b + 1; d < 5; d++) for (let e = d + 1; e < 6; e++) for (let f = e + 1; f < 7; f++) {
    const v = rank5(c, a, b, d, e, f); if (v > best) best = v;
  }
  return best;
}
export const refCategory = x => Math.floor(x / 1048576);
