// Range-Notation wie "22+,A2s+,KTs+,AJo+,KQo" → Menge von Klassen-Labels.
import { RANKS } from './cards.js';

export function expand(str) {
  const set = new Set();
  str.split(',').forEach(raw => {
    const t = raw.trim(); if (!t) return;
    const plus = t.endsWith('+'), b = plus ? t.slice(0, -1) : t;
    const a = RANKS.indexOf(b[0]), c = RANKS.indexOf(b[1]);
    if (a < 0 || c < 0) throw new Error(`Unbekannte Hand in Range: ${t}`);
    if (b.length === 2) {
      if (a !== c) throw new Error(`Paar erwartet: ${t}`);
      if (plus) for (let k = a; k < 13; k++) set.add(RANKS[k] + RANKS[k]); else set.add(b);
    } else {
      if (plus) for (let k = c; k < a; k++) set.add(b[0] + RANKS[k] + b[2]); else set.add(b);
    }
  });
  return set;
}
export const combos = l => l.length === 2 ? 6 : l[2] === 's' ? 4 : 12;
/** Anteil aller 1326 Starthände in Prozent, eine Nachkommastelle. */
export const pct = set => Math.round([...set].reduce((s, l) => s + combos(l), 0) / 1326 * 1000) / 10;
/** Label der Matrixzelle (Zeile i, Spalte j, jeweils Rang-Index 12..0). */
export const cellLabel = (i, j) => i === j ? RANKS[i] + RANKS[j] : i > j ? RANKS[i] + RANKS[j] + 's' : RANKS[j] + RANKS[i] + 'o';
