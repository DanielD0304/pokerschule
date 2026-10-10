// Zusammenführen zweier Speicherstände (Gerät und Konto). Rein, ohne Netz und DOM.
// Regeln: Pro Bereich gewinnt der Stand mit mehr Entscheidungen, Fehlerlisten werden vereinigt.
// Hat ein Stand eine neuere Epoche (zurückgesetzt oder importiert), gewinnt er ganz.
import { normalize } from './storage.js';

const MODES = ['arena', 'duel', 'flop', 'river'];
const MAX_REVIEW = 200;
const clone = o => JSON.parse(JSON.stringify(o));
const quizN = q => q.show.t + q.pre.t + q.odds.t;

/** Kennzahlen für die Rückfrage beim ersten Verbinden. */
export function summary(state) {
  const s = normalize(state);
  return {
    decisions: MODES.reduce((a, k) => a + s[k].accN, 0) + quizN(s.quiz),
    hands: MODES.reduce((a, k) => a + (s[k].hands || 0), 0),
    mistakes: s.review.items.length,
  };
}
/** true, wenn ein Stand nichts enthält, was beim Zusammenführen zählt. */
export const isEmpty = state => { const s = summary(state); return !s.decisions && !s.hands && !s.mistakes; };

const reviewKey = it => `${it.made ?? ''}|${it.spot ?? ''}|${it.orig ?? ''}`;
function mergeReview(a, b) {
  const byKey = new Map();
  for (const it of [...a.items, ...b.items]) {
    const k = reviewKey(it), old = byKey.get(k);
    // dieselbe Situation auf beiden Geräten: der weiter fortgeschrittene Lernstand zählt
    if (!old || (it.box || 0) > (old.box || 0) || ((it.box || 0) === (old.box || 0) && (it.last || 0) > (old.last || 0))) byKey.set(k, it);
  }
  let items = [...byKey.values()].sort((x, y) => (x.made || 0) - (y.made || 0));
  if (items.length > MAX_REVIEW) items = [...items].sort((x, y) => y.box - x.box || x.made - y.made).slice(items.length - MAX_REVIEW).sort((x, y) => x.made - y.made);
  // ids neu vergeben, weil zwei Geräte unabhängig hochgezählt haben
  items = items.map((it, i) => ({ ...it, id: i + 1 }));
  return { ...a, items, mastered: Math.max(a.mastered, b.mastered), seq: items.length, today: a.today ?? b.today };
}

function mergeDash(a, b) {
  const spots = { ...a.spots };
  for (const [k, s] of Object.entries(b.spots)) if (!spots[k] || s.n > spots[k].n) spots[k] = s;
  const days = { ...a.days };
  for (const [k, d] of Object.entries(b.days)) if (!days[k] || d.n > days[k].n) days[k] = d;
  return { spots, days };
}

/**
 * Führt zwei Stände zusammen. `local` ist der Stand dieses Geräts; bei Gleichstand gewinnt er.
 * Das Ergebnis ist ein neues Objekt; die Eingaben bleiben unverändert.
 */
export function merge(local, remote) {
  const a = normalize(clone(local)), b = normalize(clone(remote));
  if (a.sync.epoch !== b.sync.epoch) return a.sync.epoch > b.sync.epoch ? a : b;
  const out = { ...a };
  for (const k of MODES) out[k] = b[k].accN > a[k].accN ? b[k] : a[k];
  // ein laufendes Arena-Match gehört zum Arena-Stand, der gewonnen hat
  out.match = out.arena === b.arena ? b.match : a.match;
  out.quiz = quizN(b.quiz) > quizN(a.quiz) ? b.quiz : a.quiz;
  out.dash = mergeDash(a.dash, b.dash);
  out.review = mergeReview(a.review, b.review);
  out.ui = { ...a.ui, ageOk: a.ui.ageOk || b.ui.ageOk };
  return out;
}

/** true, wenn zwei Stände inhaltlich gleich sind (für „nichts zu tun“). */
export const same = (x, y) => JSON.stringify(normalize(x)) === JSON.stringify(normalize(y));

/** Öffentliche Kennzahlen für das Profil: Ratings und Entscheidungen je Modus (für die Ranglisten), Gesamt-Rating. */
export function publicStats(state) {
  const s = normalize(state), ratings = {}, counts = {};
  let w = 0, sum = 0;
  for (const k of MODES) {
    if (s[k].n) { ratings[k] = Math.round(s[k].rating); sum += s[k].rating * s[k].n; w += s[k].n; }
    if (s[k].accN) counts[k] = s[k].accN;
  }
  return { ratings, counts, overall: w ? Math.round(sum / w) : null, decisions: summary(s).decisions };
}

/** Prüft einen Anzeigenamen; liefert eine Fehlermeldung oder null. */
export function nameError(name) {
  const n = (name || '').trim();
  if (n.length < 3) return 'Der Anzeigename braucht mindestens 3 Zeichen.';
  if (n.length > 24) return 'Der Anzeigename darf höchstens 24 Zeichen haben.';
  // dieselbe Regel steht als Constraint in supabase/migrations (display_name_format)
  if (!/^[A-Za-z0-9ÄÖÜäöüß_.-]+$/.test(n)) return 'Erlaubt sind Buchstaben (auch Umlaute), Ziffern, Punkt, Bindestrich und Unterstrich, keine Leerzeichen.';
  return null;
}

/** Hält Entscheidungen für den Upload fest, begrenzt auf `max` Einträge (älteste fallen weg). */
export function enqueue(outbox, row, max = 2000) {
  const next = [...outbox, row];
  return next.length > max ? next.slice(next.length - max) : next;
}
