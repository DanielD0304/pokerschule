// Automatisch kopiert aus src/core/rating.js (npm run functions:sync). Nicht hier ändern.
// Bewertung einer Entscheidung und Elo-ähnliches Rating, gemeinsam für alle Modi.

export const QUAL = {
  best: ['Bester Zug', '--good'], sharp: ['Präzise', '--teal'], eq: ['Gleichwertig', '--muted'],
  inacc: ['Ungenauigkeit', '--gold'], mist: ['Fehler', '--warn'], blun: ['Patzer', '--bad'],
};
export const GOOD = new Set(['best', 'sharp', 'eq']);
/** Schwierigkeits-Konstante je Modus (aus der Kalibrierung mit simulierten Spielern). */
export const K_DIFF = { arena: .4, duel: .4, flop: .2, river: .4 };
export const START_RATING = 1000;

/**
 * loss: EV-Verlust der gewählten Aktion gegenüber der besten (BB, ≥ 0)
 * gap:  Abstand der besten zur zweitbesten Aktion (BB, ≥ 0)
 */
export function grade(loss, gap) {
  const correct = loss < .03;
  const q = correct ? (gap < .03 ? 'eq' : gap < .3 ? 'sharp' : 'best')
    : (loss < .3 ? 'inacc' : loss < 1 ? 'mist' : 'blun');
  return { q, correct };
}
export const accuracy = (correct, loss) => correct ? 100 : 100 * Math.exp(-loss / .75);
export const difficulty = (m, k) => 200 + 1800 * Math.exp(-m / k);
export const expected = (rating, diff) => 1 / (1 + Math.pow(10, (diff - rating) / 400));

/** Rating-Änderung (gerundet); 0 bei gleichwertigen Optionen. */
export function eloDelta(rating, n, { q, correct }, loss, gap, k) {
  if (q === 'eq') return 0;
  const m = correct ? gap : loss, K = n < 30 ? 40 : 20;
  return Math.round(K * ((correct ? 1 : 0) - expected(rating, difficulty(m, k))));
}

/** Bewertet die Wahl chosen unter den EVs ev: Einstufung, EV-Verlust, Abstand und Index der besten Option. */
export function judge(ev, chosen) {
  const bestEV = Math.max(...ev), bi = ev.indexOf(bestEV);
  const others = ev.filter((_, x) => x !== bi);
  const loss = bestEV - ev[chosen], gap = others.length ? bestEV - Math.max(...others) : Infinity;
  return { ...grade(loss, gap), loss, gap, bi };
}

/** Verbucht eine Entscheidung im Modus-Zustand und gibt Bewertung und Rating-Änderung zurück. */
export function applyDecision(ms, ev, chosen, k) {
  const { loss, gap, bi, ...g } = judge(ev, chosen);
  const delta = eloDelta(ms.rating, ms.n, g, loss, gap, k);
  if (g.q !== 'eq') { ms.rating = Math.max(100, ms.rating + delta); ms.n++; }
  ms.accSum += accuracy(g.correct, loss); ms.accN++;
  ms.cls[g.q] = (ms.cls[g.q] || 0) + 1;
  return { ...g, loss, gap, bi, delta };
}
