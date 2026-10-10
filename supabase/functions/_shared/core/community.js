// Automatisch kopiert aus src/core/community.js (npm run functions:sync). Nicht hier ändern.
// Ranglisten, Gruppen, Wochen-Challenge und Abzeichen (Roadmap 03, Lastenheft D-05). Rein, ohne Netz und DOM.
// Dieselben Regeln stehen für die Datenbank in supabase/migrations/20261011000000_community.sql
// (leaderboard, weekly_board); die Tests prüfen hier die Logik, dort die Zugriffsrechte.
import { answer } from './spots.js';
import { GOOD } from './rating.js';
import { MIN_RANKED } from './online.js';

/** Ranglisten. n ist die Zahl, die für die Mindestmenge zählt (Entscheidungen bzw. gewertete Matches). */
export const BOARDS = {
  overall: { name: 'Gesamt', short: 'Gesamt', unit: 'Entscheidungen' },
  arena: { name: 'Push/Fold-Arena', short: 'Arena', unit: 'Entscheidungen' },
  duel: { name: 'Preflop-Duell', short: 'Duell', unit: 'Entscheidungen' },
  flop: { name: 'Flop-Training', short: 'Flop', unit: 'Entscheidungen' },
  river: { name: 'River-Training', short: 'River', unit: 'Entscheidungen' },
  online_pf: { name: 'Online Push/Fold', short: 'Online P/F', unit: 'Matches', online: 'pf' },
  online_duel: { name: 'Online Preflop-Duell', short: 'Online Duell', unit: 'Matches', online: 'duel' },
};
export const PERIODS = { all: 'Gesamt', week: 'Diese Woche', month: 'Dieser Monat' };
export const MIN_DECISIONS = 200;   // so viele Entscheidungen, bevor jemand in einer globalen Rangliste erscheint
export const MIN_MATCHES = MIN_RANKED; // Online: gewertete Matches
export const INACTIVE_DAYS = 30;    // danach ausgeblendet, nicht gelöscht
export const GROUP_MAX = 50;
export const GROUP_NAME_RE = /^[^<>]{3,40}$/;
export const INVITE_DAYS = 7;
export const CODE_RE = /^[A-Z2-9]{8}$/;
export const SET_MAX_SPOTS = 12;

const DAY = 86400000;

/** Wert und Menge eines Profils in einer Rangliste; null, wenn dort noch nichts gespielt wurde. */
export function boardValue(p, board) {
  const b = BOARDS[board];
  if (!b) throw new Error('Unbekannte Rangliste');
  if (b.online) { const o = p.online?.[b.online]; return o ? { rating: o.rating, n: o.games } : null; }
  if (board === 'overall') return p.rating == null ? null : { rating: p.rating, n: p.decisions || 0 };
  const r = p.ratings?.[board];
  return r == null ? null : { rating: r, n: p.counts?.[board] ?? 0 };
}
export const minFor = board => BOARDS[board].online ? MIN_MATCHES : MIN_DECISIONS;

/**
 * Warum jemand (noch) nicht in der globalen Rangliste steht; null, wenn er erscheint.
 * 'account' kein Konto, 'name' kein Anzeigename, 'private' Profil nicht öffentlich, 'none' nicht gespielt,
 * 'few' zu wenig Entscheidungen, 'inactive' länger als 30 Tage nicht gespielt.
 */
export function absence(p, board, now = Date.now()) {
  if (!p) return { why: 'account' };
  if (!p.display_name) return { why: 'name' };
  if (!p.is_public) return { why: 'private' };
  const v = boardValue(p, board);
  if (!v) return { why: 'none' };
  const min = minFor(board);
  if (v.n < min) return { why: 'few', missing: min - v.n };
  if (!p.active_at || now - Date.parse(p.active_at) > INACTIVE_DAYS * DAY) return { why: 'inactive' };
  return null;
}

/** Sortierung einer Rangliste: Rating absteigend, bei Gleichstand mehr Entscheidungen zuerst. Mit Zuwachs nach Zuwachs. */
export function rank(rows, by = 'rating') {
  const key = r => by === 'gain' ? [r.gain, r.rating, r.n] : [r.rating, r.n, 0];
  return rows.slice().sort((a, b) => {
    const x = key(a), y = key(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return String(a.name).localeCompare(String(b.name), 'de');
  }).map((r, i) => ({ ...r, pos: i + 1 }));
}

/** Fügt Referenzspieler (aus der Kalibrierung) in eine Rangliste ein, ohne Platzierungen zu vergeben. */
export function withReference(rows, levels) {
  const out = [...rows.map(r => ({ ...r, ref: false })), ...levels.map(l => ({ name: l.name, rating: l.rating, note: l.note, ref: true, pos: null }))];
  return out.sort((a, b) => b.rating - a.rating || (a.ref ? 1 : -1));
}

// ---------- Zeiträume (Woche ab Montag 0 Uhr, Monat, jeweils deutsche Zeit) ----------

const TZ = 'Europe/Berlin';
let fmt = null;
/** Ortszeit in Berlin als {y, m, d, h, min, s}. */
function berlinParts(t) {
  fmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {};
  for (const p of fmt.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = +p.value;
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute, s: o.second };
}
const offsetAt = t => { const p = berlinParts(t); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(t / 1000) * 1000; };
/** Zeitpunkt (ms) von Mitternacht in Berlin am Kalendertag y-m-d (Monat 1–12, Überlauf erlaubt). */
export function berlinMidnight(y, m, d) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

/** Kalenderwoche nach ISO 8601 in deutscher Zeit: { key: '2026-W41', start, end } (end exklusiv). */
export function weekOf(t = Date.now()) {
  const p = berlinParts(t);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d)), dow = (day.getUTCDay() + 6) % 7; // Montag 0
  const monday = new Date(day.getTime() - dow * DAY);
  // ISO-Jahr und -Woche: der Donnerstag dieser Woche bestimmt das Jahr
  const thu = new Date(monday.getTime() + 3 * DAY), jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  const wk = 1 + Math.floor((thu.getTime() - jan1) / (7 * DAY));
  const start = berlinMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
  const end = berlinMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate() + 7);
  return { key: `${thu.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`, start, end };
}
/** Woche aus ihrem Schlüssel. */
export function weekFromKey(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(key || '');
  if (!m) return null;
  // 4. Januar liegt immer in Woche 1
  const jan4 = Date.UTC(+m[1], 0, 4), dow = (new Date(jan4).getUTCDay() + 6) % 7;
  const monday = new Date(jan4 - dow * DAY + (+m[2] - 1) * 7 * DAY);
  const w = weekOf(berlinMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()) + DAY / 2);
  return w.key === key ? w : null;
}
export const weekNumber = key => +key.slice(6);
/** Monat in deutscher Zeit: { key: '2026-10', start, end }. */
export function monthOf(t = Date.now()) {
  const p = berlinParts(t);
  return { key: `${p.y}-${String(p.m).padStart(2, '0')}`, start: berlinMidnight(p.y, p.m, 1), end: berlinMidnight(p.y, p.m + 1, 1) };
}

// ---------- Wochen-Challenge ----------

/**
 * Wertet die Antworten einer Person aus. answers: [{ c: Index der Option, ms: Bedenkzeit }].
 * Ergebnis: durchschnittlicher EV-Verlust (BB), Gesamtzeit, Zahl richtiger Entscheidungen, Einzelbewertungen.
 */
export function scoreEntry(spots, answers) {
  if (answers.length !== spots.length) throw new Error('Nicht alle Spots beantwortet');
  const items = answers.map((x, i) => { const r = answer(spots[i], x.c); return { c: x.c, ms: x.ms, q: r.q, loss: r.loss, best: r.bi }; });
  const loss = items.reduce((a, x) => a + x.loss, 0) / items.length;
  return {
    loss: Math.round(loss * 10000) / 10000,
    ms: items.reduce((a, x) => a + x.ms, 0),
    good: items.filter(x => GOOD.has(x.q)).length,
    items,
  };
}
/** Reihenfolge der Challenge: weniger EV-Verlust zuerst, bei Gleichstand die schnellere Zeit. */
export function rankEntries(entries) {
  return entries.slice().sort((a, b) => a.loss - b.loss || a.ms - b.ms).map((e, i) => ({ ...e, pos: i + 1 }));
}
/** Verteilung der Antworten je Spot: Anteil jeder Option (0..1) und Zahl der Antworten. */
export function distribution(spots, allAnswers) {
  return spots.map((s, i) => {
    const counts = new Array(s.options.length).fill(0);
    let n = 0;
    for (const a of allAnswers) { const c = a?.[i]?.c; if (Number.isInteger(c) && c >= 0 && c < counts.length) { counts[c]++; n++; } }
    return { n, share: counts.map(x => n ? x / n : 0) };
  });
}

// ---------- Freundesvergleich je Situation ----------

/**
 * rows: [{ spot, my_n, my_loss, their_n, their_loss }] aus friend_compare (Summe der EV-Verluste).
 * Ergebnis je Situation mit Durchschnitt und wer besser ist; Situationen mit zu wenig Daten zuletzt.
 */
export function compareSpots(rows, min = 5) {
  return rows.map(r => {
    const mine = r.my_n ? r.my_loss / r.my_n : null, theirs = r.their_n ? r.their_loss / r.their_n : null;
    const enough = r.my_n >= min && r.their_n >= min;
    const diff = enough ? theirs - mine : null; // > 0: du verlierst weniger
    return { spot: r.spot, myN: r.my_n, theirN: r.their_n, mine, theirs, enough, diff, better: !enough || Math.abs(diff) < .01 ? null : diff > 0 ? 'me' : 'them' };
  }).sort((a, b) => (b.enough - a.enough) || Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0) || (b.myN + b.theirN) - (a.myN + a.theirN));
}

// ---------- Abzeichen ----------

export const BADGES = [
  { id: 'd100', name: 'Erste Hundert', text: '100 bewertete Entscheidungen', test: p => (p.decisions || 0) >= 100 },
  { id: 'd1000', name: 'Tausender', text: '1 000 bewertete Entscheidungen', test: p => (p.decisions || 0) >= 1000 },
  { id: 'd10000', name: 'Dauerbrenner', text: '10 000 bewertete Entscheidungen', test: p => (p.decisions || 0) >= 10000 },
  { id: 'adv', name: 'Fortgeschritten', text: 'Gesamt-Rating 1450 bei mindestens 200 Entscheidungen', test: p => (p.rating || 0) >= 1450 && (p.decisions || 0) >= MIN_DECISIONS },
  { id: 'strong', name: 'Stark', text: 'Gesamt-Rating 1750 bei mindestens 200 Entscheidungen', test: p => (p.rating || 0) >= 1750 && (p.decisions || 0) >= MIN_DECISIONS },
  { id: 'allround', name: 'Allrounder', text: 'In Arena, Duell, Flop und River je 50 Entscheidungen', test: p => ['arena', 'duel', 'flop', 'river'].every(k => (p.counts?.[k] || 0) >= 50) },
  { id: 'online', name: 'Gegen Menschen', text: '10 gewertete Online-Matches', test: p => Object.values(p.online || {}).some(o => (o?.games || 0) >= MIN_MATCHES) },
  { id: 'week1', name: 'Herausforderer', text: 'Eine Wochen-Challenge abgeschlossen', test: p => (p.weekly?.played || 0) >= 1 },
  { id: 'week10', name: 'Stammgast', text: 'Zehn Wochen-Challenges abgeschlossen', test: p => (p.weekly?.played || 0) >= 10 },
  { id: 'podium', name: 'Podest', text: 'In einer Wochen-Challenge unter den ersten drei', test: p => (p.weekly?.best || Infinity) <= 3 },
];
/** Abzeichen eines Profils, erreichte zuerst. */
export const badgesOf = p => BADGES.map(b => ({ id: b.id, name: b.name, text: b.text, earned: !!p && b.test(p) }));
