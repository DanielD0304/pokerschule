// Fortschritt über alle Modi: Situations-Statistik (Dashboard) und gespeicherte Fehler (Fehler-Training).
import { state, persist } from './store.js';
import { GOOD } from '../core/rating.js';

export const today = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

export const SPOTNAME = {
  'arena:SB': ['Arena', 'All-in oder Fold im Small Blind', 'arena'], 'arena:BB': ['Arena', 'Call gegen All-in im Big Blind', 'arena'],
  'duel:root': ['Duell', 'Eröffnen im Small Blind', 'duel'], 'duel:vsOpen': ['Duell', 'Big Blind gegen Raise', 'duel'], 'duel:vs3b': ['Duell', 'Small Blind gegen 3-Bet', 'duel'],
  'duel:vs4b': ['Duell', 'Big Blind gegen 4-Bet', 'duel'], 'duel:vsJam': ['Duell', 'Small Blind gegen All-in', 'duel'],
  'flop:f_root': ['Flop', 'Big Blind: Check oder Donk-Bet', 'flop'], 'flop:f_ip': ['Flop', 'C-Bet nach Check (in Position)', 'flop'],
  'flop:f_vsB33': ['Flop', 'Verteidigen gegen ⅓-Pot-Bet', 'flop'], 'flop:f_vsB75': ['Flop', 'Verteidigen gegen ¾-Pot-Bet', 'flop'],
  'flop:f_vsR33': ['Flop', 'Gegen Check-Raise nach kleiner C-Bet', 'flop'], 'flop:f_vsR75': ['Flop', 'Gegen Check-Raise nach großer C-Bet', 'flop'],
  'flop:f_vsDonk': ['Flop', 'Gegen Donk-Bet', 'flop'], 'flop:f_vsDR': ['Flop', 'Gegen Raise auf deine Donk-Bet', 'flop'],
  'turn:u_root': ['Turn', 'Big Blind: Check oder Lead', 'turn'], 'turn:u_ip': ['Turn', 'Zweite Barrel oder Check-Back', 'turn'],
  'turn:u_vs33': ['Turn', 'Verteidigen gegen ⅓-Pot-Bet', 'turn'], 'turn:u_vs75': ['Turn', 'Verteidigen gegen ¾-Pot-Bet', 'turn'], 'turn:u_vs150': ['Turn', 'Verteidigen gegen Overbet', 'turn'],
  'turn:u_vsR33': ['Turn', 'Gegen Raise auf deine kleine Bet', 'turn'], 'turn:u_vsR75': ['Turn', 'Gegen Raise auf deine ¾-Bet', 'turn'], 'turn:u_vsR150': ['Turn', 'Gegen Raise auf dein Overbet', 'turn'],
  'turn:u_vsLead': ['Turn', 'Gegen Lead-Bet', 'turn'], 'turn:u_vsRLead': ['Turn', 'Gegen Raise auf deinen Lead', 'turn'],
  'river:r_root': ['River', 'Big Blind: Check oder Lead', 'river'], 'river:r_ip': ['River', 'Value-Bet oder Bluff in Position', 'river'],
  'river:r_vs33': ['River', 'Bluff-Catching gegen ⅓ Pot', 'river'], 'river:r_vs75': ['River', 'Bluff-Catching gegen ¾ Pot', 'river'], 'river:r_vs150': ['River', 'Bluff-Catching gegen Overbet', 'river'],
  'river:r_vsR33': ['River', 'Gegen Raise auf deine kleine Bet', 'river'], 'river:r_vsR75': ['River', 'Gegen Raise auf deine ¾-Bet', 'river'], 'river:r_vsR150': ['River', 'Gegen Raise auf dein Overbet', 'river'],
  'river:r_vsLead': ['River', 'Gegen Lead-Bet', 'river'], 'river:r_vsLR': ['River', 'Gegen Raise auf deinen Lead', 'river'],
};
export const spotTitle = k => SPOTNAME[k] ? SPOTNAME[k][0] + ' · ' + SPOTNAME[k][1] : k;

const decisionListeners = new Set();
/** Meldet jede gezählte Entscheidung (für die Synchronisierung mit dem Konto). */
export const onDecision = fn => { decisionListeners.add(fn); return () => decisionListeners.delete(fn); };

/** Zählt eine Entscheidung für Tagesaktivität und (außer Quiz und Wiederholung) für die Situations-Statistik. */
export function track(mode, node, q, loss) {
  const dash = state.dash, t = today(), d = dash.days[t] || (dash.days[t] = { n: 0, ok: 0 });
  d.n++; if (GOOD.has(q)) d.ok++;
  if (mode !== 'quiz' && mode !== 'review') {
    const k = mode + ':' + node, s = dash.spots[k] || (dash.spots[k] = { n: 0, wrong: 0, loss: 0 });
    s.n++; s.loss += Math.max(0, loss || 0); if (!GOOD.has(q)) s.wrong++;
  }
  persist();
  decisionListeners.forEach(fn => fn({ mode, spot: mode + ':' + node, q, loss: Math.max(0, loss || 0) }));
}

const mistakeListeners = [];
export const onMistake = fn => mistakeListeners.push(fn);
/** Speichert eine Ungenauigkeit, einen Fehler oder einen Patzer als Momentaufnahme für das Fehler-Training. */
export function saveMistake(m) {
  if (!['inacc', 'mist', 'blun'].includes(m.q)) return;
  const rv = state.review;
  rv.seq++;
  rv.items.push({ ...m, id: rv.seq, box: 0, seen: 0, last: 0, made: Date.now() });
  if (rv.items.length > 200) { rv.items.sort((a, b) => b.box - a.box || a.made - b.made); rv.items.shift(); }
  persist();
  mistakeListeners.forEach(fn => fn());
}
