// Preflop-Tabellen aus pf-data.json: Equity 169×169 und Push/Fold-Gleichgewicht.
import { CMB, compatMatrix } from './cards.js';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 → Bytes, ohne atob/Buffer, damit es im Browser und in Node gleich läuft. */
export function base64ToBytes(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ''), out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, o);
}

/** Equity-Matrix aus dem oberen Dreieck (uint16, little endian). */
export function decodeEquity(b64) {
  const bytes = base64ToBytes(b64);
  const M = Array.from({ length: 169 }, () => new Float64Array(169));
  let k = 0;
  for (let a = 0; a < 169; a++) for (let b = a; b < 169; b++) {
    const e = (bytes[2 * k] | (bytes[2 * k + 1] << 8)) / 65535; k++;
    M[a][b] = e; M[b][a] = 1 - e;
  }
  for (let a = 0; a < 169; a++) M[a][a] = .5;
  return M;
}
export const freqChar = ch => ch === 'a' ? 1 : +ch / 10;
export function decodeNash(nash) {
  const out = {};
  for (const S in nash) out[S] = { push: [...nash[S].push].map(freqChar), call: [...nash[S].call].map(freqChar) };
  return out;
}

/** Alle Preflop-Tabellen auf einmal. */
export function makeTables(pfData) {
  const EQ = decodeEquity(pfData.eq), CPT = compatMatrix(), NASH = decodeNash(pfData.nash);
  // Handstärke = Equity gegen eine zufällige Hand; daraus das Perzentil (Anteil gleich guter oder besserer Hände)
  const HS = CMB.map((_, i) => { let w = 0, e = 0; for (let j = 0; j < 169; j++) { w += CPT[i][j]; e += CPT[i][j] * EQ[i][j]; } return e / w; });
  const ord = [...Array(169).keys()].sort((a, b) => HS[b] - HS[a]);
  const PCTL = new Array(169); let c = 0;
  for (const i of ord) { c += CMB[i].length; PCTL[i] = c / 1326; }
  return { EQ, CPT, NASH, HS, PCTL };
}
/** Anteil aller Starthände, die eine Frequenztabelle spielt. */
export const pctOf = fr => fr.reduce((s, f, i) => s + f * CMB[i].length, 0) / 1326;
