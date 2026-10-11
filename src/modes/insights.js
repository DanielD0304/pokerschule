// Auswertung über alle Modi: Ratings, Genauigkeit, größte Lecks, Empfehlung. Rein, ohne DOM.
import { SPOTNAME, today } from './progress.js';

export const MODES = [
  { k: 'arena', name: 'Push/Fold-Arena', path: '/spielen/arena' },
  { k: 'duel', name: 'Preflop-Duell', path: '/spielen/duell' },
  { k: 'flop', name: 'Flop-Training', path: '/training/flop' },
  { k: 'turn', name: 'Turn-Training', path: '/training/turn' },
  { k: 'river', name: 'River-Training', path: '/training/river' },
];
/** Pfad zu einer Situation wie 'flop:f_ip'. */
export const spotPath = k => MODES.find(m => m.k === k.split(':')[0])?.path || '/';

/** Referenzstufen aus der Kalibrierung mit simulierten Spielern. */
export const LEVELS = [
  { name: 'Zufallsklicker', rating: 600, note: 'entscheidet zufällig' },
  { name: 'Einsteiger', rating: 1000, note: 'kennt die Grundlagen, macht oft klare Fehler' },
  { name: 'Fortgeschritten', rating: 1450, note: 'liegt bei klaren Spots fast immer richtig' },
  { name: 'Stark', rating: 1750, note: 'trifft auch knappe Entscheidungen meist richtig' },
  { name: 'Solver-Niveau', rating: 2500, note: 'spielt praktisch fehlerfrei' },
];
export const levelOf = r => [...LEVELS].reverse().find(l => r >= l.rating - 100) || LEVELS[0];

export function insights(state) {
  const quiz = state.quiz, dash = state.dash;
  const played = MODES.map(m => { const s = state[m.k]; return { ...m, s, dec: s.accN, acc: s.accN ? s.accSum / s.accN : null }; });
  const totDec = played.reduce((a, m) => a + m.dec, 0);
  const quizN = quiz.show.t + quiz.pre.t + quiz.odds.t, quizC = quiz.show.c + quiz.pre.c + quiz.odds.c;
  const accAll = totDec ? played.reduce((a, m) => a + m.s.accSum, 0) / totDec : null;
  const ratedN = played.reduce((a, m) => a + m.s.n, 0);
  const overall = ratedN ? Math.round(played.reduce((a, m) => a + m.s.rating * m.s.n, 0) / ratedN) : null;
  const spots = Object.entries(dash.spots).filter(([k]) => SPOTNAME[k]).map(([k, s]) => ({ k, ...s, avg: s.loss / s.n, rate: s.wrong / s.n, title: SPOTNAME[k] }));
  const trackedLoss = spots.reduce((a, s) => a + s.loss, 0), trackedN = spots.reduce((a, s) => a + s.n, 0);
  const weak = spots.filter(s => s.n >= 3).sort((a, b) => b.avg - a.avg).slice(0, 5);
  const strong = spots.filter(s => s.n >= 5 && s.rate <= .3).sort((a, b) => a.avg - b.avg).slice(0, 3);
  const order = ['best', 'sharp', 'eq', 'inacc', 'mist', 'blun'], cls = Object.fromEntries(order.map(q => [q, 0]));
  played.forEach(m => order.forEach(q => { cls[q] += m.s.cls[q] || 0; }));
  const days = Object.keys(dash.days);
  // Serie: aufeinanderfolgende Tage mit Training, bis heute oder gestern
  let streak = 0;
  const d = new Date();
  if (!dash.days[today(d)]?.n) d.setDate(d.getDate() - 1);
  while (dash.days[today(d)]?.n) { streak++; d.setDate(d.getDate() - 1); }

  let rec;
  if (!totDec && !quizN) rec = { kind: 'start', text: 'Du hast noch nichts gespielt. Fang mit den Grundlagen und dem Quiz „Wer gewinnt?“ an, danach geht es in die Arena.', path: '/lernen/grundlagen', cta: 'Grundlagen lernen' };
  else if (weak.length && weak[0].avg >= .05) {
    const w = weak[0];
    rec = { kind: 'leak', spot: w, text: `Dein größtes Leck: ${w.title[0]} · ${w.title[1]}. Dort verlierst du im Schnitt ${w.avg.toFixed(2).replace('.', ',')} BB pro Entscheidung und liegst in ${Math.round(w.rate * 100)} % der Fälle daneben.`, path: spotPath(w.k), cta: 'Jetzt üben' };
  } else {
    const next = played.find(m => m.dec < 20);
    rec = next ? { kind: 'explore', text: `Du spielst sauber. Sammle als Nächstes Erfahrung im ${next.name}: Dort hast du erst ${next.dec} Entscheidungen.`, path: next.path, cta: 'Weiter' }
      : { kind: 'keep', text: 'Keine auffälligen Lecks. Halte das Niveau und achte auf knappe Spots.', path: '/training/fehler', cta: 'Fehler wiederholen' };
  }
  return { played, totDec, quizN, quizC, accAll, overall, spots, weak, strong, cls, order, trackedLoss, trackedN, activeDays: days.length, streak, rec, reviewOpen: state.review.items.length };
}
