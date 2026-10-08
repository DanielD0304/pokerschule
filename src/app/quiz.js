// Grundlagen und Quiz-Stationen: Rangfolge, Showdown, Preflop (Faustregel-Ranges), Pot Odds, Ranges-Ansicht.
import { parse, deck, labelOf } from '../core/cards.js';
import { best5, compare, handName } from '../core/evaluator.js';
import { expand, pct, cellLabel } from '../core/ranges.js';
import { makeScenario, ruleOfThumb } from '../core/potodds.js';
import { state, persist, renderHeader, onReset } from './store.js';
import { track } from './progress.js';
import { $, cardHTML, cardsHTML, pc1, b1, modelNote } from './dom.js';

const RK = [
  ['Royal Flush', 'A-K-Q-J-10 in einer Farbe', 'As Ks Qs Js Ts'],
  ['Straight Flush', 'Fünf aufeinanderfolgende Karten einer Farbe', '9h 8h 7h 6h 5h'],
  ['Vierling', 'Vier Karten gleichen Werts', 'Qc Qd Qh Qs 4d'],
  ['Full House', 'Drilling plus Paar', 'Kh Kd Ks 7c 7h'],
  ['Flush', 'Fünf Karten einer Farbe', 'Ad Jd 8d 5d 2d'],
  ['Straße', 'Fünf aufeinanderfolgende Karten, Farbe egal. A-2-3-4-5 zählt auch.', 'Tc 9d 8s 7h 6c'],
  ['Drilling', 'Drei Karten gleichen Werts', '8s 8h 8d Kc 3s'],
  ['Zwei Paare', 'Zwei verschiedene Paare', 'Jh Jc 4s 4d Ac'],
  ['Ein Paar', 'Zwei Karten gleichen Werts', 'Ah Ad 9c 6s 2h'],
  ['Höchste Karte', 'Nichts davon: die höchste Karte zählt', 'Kd Js 8c 5h 3d'],
];

export const POS = {
  UTG: { name: 'UTG', desc: 'Under the Gun: du handelst zuerst, fünf Spieler sitzen hinter dir. Nur starke Hände.', r: '22+,A2s+,KTs+,QTs+,JTs,T9s,AJo+,KQo' },
  HJ: { name: 'Hijack', desc: 'Vier Spieler hinter dir. Etwas mehr suited Hände kommen dazu.', r: '22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,ATo+,KJo+' },
  CO: { name: 'Cutoff', desc: 'Nur noch Button und Blinds hinter dir. Deutlich breiter.', r: '22+,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,A9o+,KTo+,QTo+,JTo' },
  BTN: { name: 'Button', desc: 'Beste Position: du handelst nach dem Flop immer zuletzt. Fast jede zweite Hand.', r: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,86s+,75s+,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o,98o' },
  SB: { name: 'Small Blind', desc: 'Nur der Big Blind ist hinter dir, aber nach dem Flop bist du außer Position. Raise oder Fold, kein Limp.', r: '22+,A2s+,K5s+,Q7s+,J7s+,T7s+,97s+,86s+,76s,65s,54s,A7o+,A5o,KTo+,QTo+,JTo' },
};
Object.values(POS).forEach(p => { p.set = expand(p.r); });

function rangeMatrix(set, hl) {
  let out = '';
  for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
    const lab = cellLabel(i, j), inR = set.has(lab);
    out += `<div class="${inR ? 'in' : ''} ${lab === hl ? 'hl' : ''}" title="${lab}: ${inR ? 'Raise' : 'Fold'}">${lab}</div>`;
  }
  return out;
}

function record(k, ok) {
  const q = state.quiz;
  track('quiz', k, ok ? 'best' : 'blun', 0);
  q[k].t++;
  if (ok) { q[k].c++; q.streak++; q.best = Math.max(q.best, q.streak); } else q.streak = 0;
  persist(); renderHeader();
}
function setActions(id, on) { document.querySelectorAll('#' + id + ' button').forEach(b => { b.disabled = !on; }); }
function feedback(id, ok, head, body, next) {
  const el = $(id);
  el.innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}"><span class="verdict">${ok ? 'Richtig.' : 'Leider falsch.'} ${head}</span>${body}<div><button class="btn primary" id="${id}-next">Nächste Hand</button></div></div>`;
  const n = $(id + '-next'); n.onclick = next; n.focus({ preventScroll: true });
}

// --- Showdown ---
let sd = null;
function newShow() {
  const d = deck(), A = [d[0], d[1]], B = [d[2], d[3]], board = d.slice(4, 9);
  const ea = best5([...A, ...board]), eb = best5([...B, ...board]), c = compare(ea.score, eb.score);
  sd = { ea, eb, ans: c > 0 ? 'A' : c < 0 ? 'B' : 'S' };
  $('show-table').innerHTML = `<span class="label">Board</span><div class="row">${cardsHTML(board)}</div>
    <div class="hands"><div class="hand"><span class="label">Spieler A</span><div class="row">${cardsHTML(A)}</div></div>
    <div class="hand"><span class="label">Spieler B</span><div class="row">${cardsHTML(B)}</div></div></div>`;
  $('show-fb').innerHTML = ''; setActions('show-actions', true);
}
function answerShow(a) {
  const ok = a === sd.ans; record('show', ok); setActions('show-actions', false);
  const w = { A: 'Spieler A gewinnt.', B: 'Spieler B gewinnt.', S: 'Split Pot: beide haben exakt gleich gute fünf Karten.' }[sd.ans];
  const line = (n, e) => `<div><b>${n}:</b> ${handName(e.score)}<div class="row" style="justify-content:flex-start;margin-top:4px">${cardsHTML(e.cards, 'sm')}</div></div>`;
  feedback('show-fb', ok, w, line('Spieler A', sd.ea) + line('Spieler B', sd.eb), newShow);
}

// --- Preflop (Faustregel, echte Kartenverteilung) ---
let pf = null;
function newPre() {
  const keys = Object.keys(POS), pos = keys[(Math.random() * keys.length) | 0];
  const d = deck(), cards = [d[0], d[1]], label = labelOf(cards[0], cards[1]);
  pf = { pos, label, ans: POS[pos].set.has(label) ? 'raise' : 'fold' };
  $('pre-table').innerHTML = `<span class="label">Deine Position</span><div style="font-family:var(--f-display);font-size:1.6rem">${POS[pos].name}</div>
    <div class="row">${cardsHTML(cards)}</div><span class="label">${label}</span>`;
  $('pre-fb').innerHTML = ''; setActions('pre-actions', true);
}
function answerPre(a) {
  const ok = a === pf.ans; record('pre', ok); setActions('pre-actions', false);
  const p = POS[pf.pos];
  const head = pf.ans === 'raise' ? `Raise. ${pf.label} gehört vom ${p.name} zur Open-Range.` : `Fold. ${pf.label} ist vom ${p.name} zu schwach.`;
  feedback('pre-fb', ok, head, `<p>${p.desc} Diese Faustregel-Range umfasst etwa ${String(pct(p.set)).replace('.', ',')} % aller Hände.</p><div class="matrix-wrap"><div class="matrix">${rangeMatrix(p.set, pf.label)}</div></div>`, newPre);
}

// --- Pot Odds (BB, Turn oder Flop) ---
let po = null;
function newOdds() {
  po = makeScenario();
  const { street, draw, pot, bet } = po;
  $('odds-table').innerHTML = `<span class="label">${street === 'turn' ? 'Turn · eine Karte kommt noch' : 'Flop · Turn und River kommen noch'}</span>
    <div class="pot"><div><span class="label">Pot</span><b>${b1(pot)} BB</b></div><div><span class="label">Gegner setzt all-in</span><b>${b1(bet)} BB</b></div><div><span class="label">Du musst zahlen</span><b>${b1(bet)} BB</b></div></div>
    <p>Du hast <b>${draw.name}</b>. Wie viele Outs sind das, und reicht das für den Call?</p>`;
  $('odds-fb').innerHTML = ''; setActions('odds-actions', true);
}
function answerOdds(a) {
  const ok = a === po.ans; record('odds', ok); setActions('odds-actions', false);
  const { pot, bet, need, eq, draw, street } = po, o = draw.outs;
  const exact = street === 'turn' ? `exakt ${o}/46 = ${pc1(eq)}` : `exakt 1 − (${47 - o}/47 × ${46 - o}/46) = ${pc1(eq)}`;
  feedback('odds-fb', ok, po.ans === 'call' ? 'Call ist richtig.' : 'Fold ist richtig.',
    `<div class="math">Outs: ${o} → Faustregel ${o}×${street === 'turn' ? 2 : 4} ≈ ${pc1(ruleOfThumb(o, street))} · ${exact}<br>
     Benötigt: ${b1(bet)} ÷ (${b1(pot)} + ${b1(bet)} + ${b1(bet)}) = ${b1(bet)} ÷ ${b1(pot + 2 * bet)} = ${pc1(need)}</div>
     <p>${po.ans === 'call' ? 'Deine Gewinnchance ist höher als der Preis, den der Pot verlangt. Auf lange Sicht verdienst du mit diesem Call.' : 'Der Call kostet mehr, als deine Gewinnchance hergibt. Auf lange Sicht verlierst du mit diesem Call.'}</p>
     <p><b>Achtung, unsaubere Outs:</b> ${draw.dirty}</p>
     ${modelNote('Exakte Wahrscheinlichkeit, wenn alle Outs sauber sind. Unsaubere Outs und Implied Odds sind nicht eingerechnet.')}`, newOdds);
}

// --- Ranges-Ansicht ---
function renderRange() {
  const p = POS[$('range-pos').value];
  $('range-matrix').innerHTML = rangeMatrix(p.set, '');
  $('range-pct').textContent = `${String(pct(p.set)).replace('.', ',')} % der Hände`;
  $('range-desc').textContent = p.desc;
}

export function initQuiz() {
  $('ranking').innerHTML = RK.map((r, i) => `<div class="rk"><span class="n">${i + 1}</span><span class="t"><b>${r[0]}</b><small>${r[1]}</small></span><div class="row">${parse(r[2]).map(c => cardHTML(c, 'sm')).join('')}</div></div>`).join('');
  document.querySelectorAll('#show-actions button').forEach(b => { b.onclick = () => answerShow(b.dataset.a); });
  document.querySelectorAll('#pre-actions button').forEach(b => { b.onclick = () => answerPre(b.dataset.a); });
  document.querySelectorAll('#odds-actions button').forEach(b => { b.onclick = () => answerOdds(b.dataset.a); });
  const sel = $('range-pos');
  sel.innerHTML = Object.entries(POS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  sel.onchange = renderRange;
  renderRange(); newShow(); newPre(); newOdds();
  onReset(renderHeader);
}
