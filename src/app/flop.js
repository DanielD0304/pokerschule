// Flop-Training im Single-Raised-Pot auf Kombo-Ebene.
import { RANKS, SUITS, RNAME, RONE, icard, cint, cid, classOfInts } from '../core/cards.js';
import { evalCards, toArray, handName } from '../core/evaluator.js';
import { exactEq } from '../core/equity.js';
import { applyDecision, K_DIFF } from '../core/rating.js';
import { fR } from '../core/hutree.js';
import { state, persist, renderHeader, onReset } from './store.js';
import { track, saveMistake } from './progress.js';
import { flopData } from './data.js';
import { $, cardsHTML, BACKS, SLOT, nf, sg, pc1, strCards, ratingCard, evCards, logHTML, pushLog, worstOf, decisionBlock, mixText, mixMatrix, modelNote, analysis, pickW, sampleIndex } from './dom.js';

export const FNODE = {
  f_root: { pot: 5, face: 'Du handelst zuerst (out of position).', lab: { check: 'Check', donk: 'Bet 1,65 (⅓ Pot)' } },
  f_ip: { pot: 5, face: 'Der Bot checkt zu dir.', lab: { check: 'Check', b33: 'Bet 1,65 (⅓ Pot)', b75: 'Bet 3,75 (¾ Pot)' } },
  f_vsB33: { pot: 6.65, face: 'Der Bot setzt 1,65 BB (⅓ Pot).', lab: { fold: 'Fold', call: 'Call 1,65', raise: 'Raise auf 5' } },
  f_vsR33: { pot: 11.65, face: 'Der Bot erhöht auf 5 BB.', lab: { fold: 'Fold', call: 'Call 3,35' } },
  f_vsB75: { pot: 8.75, face: 'Der Bot setzt 3,75 BB (¾ Pot).', lab: { fold: 'Fold', call: 'Call 3,75', raise: 'Raise auf 11' } },
  f_vsR75: { pot: 19.75, face: 'Der Bot erhöht auf 11 BB.', lab: { fold: 'Fold', call: 'Call 7,25' } },
  f_vsDonk: { pot: 6.65, face: 'Der Bot setzt 1,65 BB (⅓ Pot) in dich hinein.', lab: { fold: 'Fold', call: 'Call 1,65', raise: 'Raise auf 5' } },
  f_vsDR: { pot: 11.65, face: 'Der Bot erhöht auf 5 BB.', lab: { fold: 'Fold', call: 'Call 3,35' } },
};
const NAME = { check: 'Check', donk: 'Bet ⅓', b33: 'Bet ⅓', b75: 'Bet ¾', fold: 'Fold', call: 'Call', raise: 'Raise' };
const COL = { check: 'var(--surface-2)', fold: 'var(--surface-2)', call: 'var(--teal)', donk: 'var(--gold)', b33: 'var(--gold)', b75: 'var(--accent)', raise: 'var(--bad)' };
const model = expl => `Flop-Gleichgewicht auf Kombo-Ebene; Turn und River werden über Equity-Realisierung geschätzt, nicht gespielt. Lösungsgüte dieses Boards: ausnutzbar um ${nf(expl, 3)} % des Pots. Urteile über die Einsatzgröße sind weniger verlässlich als Fold, Call oder Value-Bet.`;
let H = null, last = null;
const F = () => state.flop;

/** Gemachte Hand und Draws in Worten. */
export function describe(me, board) {
  const all = [...me, ...board], sc = toArray(evalCards(all)), br = board.map(c => c.r).sort((a, b) => b - a);
  let made;
  if (sc[0] === 1) {
    const p = sc[1], onBoard = board.filter(c => c.r === p).length, pocket = me[0].r === me[1].r;
    if (onBoard === 2) made = 'Nur das Paar auf dem Board';
    else if (pocket) made = p > br[0] ? `Overpair (${RNAME[p]})` : p < br[br.length - 1] ? `Underpair (${RNAME[p]})` : `Pocket-Paar ${RNAME[p]} unter der höchsten Boardkarte`;
    else if (p === br[0]) made = `Top Pair (${RNAME[p]}), Kicker ${RONE[me.find(c => c.r !== p).r]}`;
    else if (p === br[1]) made = `Zweites Paar (${RNAME[p]})`;
    else made = `Schwaches Paar (${RNAME[p]})`;
  } else made = sc[0] === 0 ? `Kein Paar (${RONE[sc[1]]} hoch)` : handName(evalCards(all));
  const dr = [];
  if (sc[0] < 5) for (let s = 0; s < 4; s++) { const n = all.filter(c => c.s === s).length; if (n === 4 && me.some(c => c.s === s)) dr.push('Flush-Draw'); }
  if (sc[0] < 4) {
    const has = new Set(all.map(c => c.r)); if (has.has(14)) has.add(1);
    let outs = 0;
    for (let r = 2; r <= 14; r++) {
      if (has.has(r)) continue;
      const h2 = new Set(has); h2.add(r); if (r === 14) h2.add(1);
      for (let lo = 1; lo <= 10; lo++) {
        let ok = true; for (let x = lo; x < lo + 5; x++) if (!h2.has(x)) { ok = false; break; }
        if (ok && ((r >= lo && r < lo + 5) || (r === 14 && lo === 1))) { outs++; break; }
      }
    }
    if (outs >= 2) dr.push('Open-Ended Straight-Draw'); else if (outs === 1) dr.push('Gutshot');
  }
  return made + (dr.length ? ' · ' + dr.join(' + ') : '');
}

function render() {
  const fs = F();
  $('fl-stats').innerHTML = ratingCard(fs, last) + evCards(fs, 'EV-Bilanz', `BB glücksbereinigt, ${fs.hands} Hände`);
  $('fl-log').innerHTML = logHTML(fs.log);
  renderHeader();
}
const seqText = () => H.hist.map(x => `${x.who === 'me' ? 'Du' : 'Bot'} ${NAME[x.a]}`).join(' · ');
function renderTable(reveal) {
  const FT = flopData().tree, pot = FT[H.node].t ? H.finalPot : FNODE[H.node].pot, botPos = H.pos === 'SB' ? 'BB' : 'SB';
  $('fl-table').innerHTML = `<div class="seat"><span class="label">Bot · ${botPos} · ${botPos === 'SB' ? 'in Position' : 'out of position'}</span><div class="row">${reveal ? cardsHTML(H.bot) : BACKS}</div></div>
    <span class="label">Flop · Preflop: SB erhöht auf 2,5, BB callt</span>
    <div class="row">${cardsHTML(H.board)}${SLOT}${SLOT}</div>
    <span class="potline">Pot ${nf(pot, 2)} BB</span>
    <span style="font-size:.9rem;min-height:1.4em">${seqText() || '&nbsp;'}</span>
    <div class="seat"><div class="row">${cardsHTML(H.me)}</div><span class="label">Du · ${H.pos} · ${H.pos === 'SB' ? 'in Position' : 'out of position'}</span><span style="font-size:.9rem">${describe(H.me, H.board)}</span></div>`;
}

function newHand() {
  const FD = flopData(), B = FD.boards[(Math.random() * FD.boards.length) | 0];
  const board = [0, 2, 4].map(k => ({ r: RANKS.indexOf(B.board[k]) + 2, s: SUITS.indexOf(B.board[k + 1]) }));
  const pos = F().hands % 2 === 0 ? 'BB' : 'SB', mine = pos === 'SB' ? B.sb : B.bb, his = pos === 'SB' ? B.bb : B.sb;
  const mi = pickW(mine.c, mine.w, () => true), mc = mine.c[mi], ma = Math.floor(mc / 52), mb = mc % 52;
  const bi = pickW(his.c, his.w, c => { const a = Math.floor(c / 52), b = c % 52; return a !== ma && a !== mb && b !== ma && b !== mb; }), bc = his.c[bi];
  H = { B, board, pos, mi, bi, me: [icard(ma), icard(mb)], meI: [ma, mb], bot: [icard(Math.floor(bc / 52)), icard(bc % 52)], botI: [Math.floor(bc / 52), bc % 52], node: 'f_root', hist: [], dec: [], path: [] };
  $('fl-fb').innerHTML = ''; advance();
}
function advance() {
  const FT = flopData().tree, id = H.node, n = FT[id];
  if (n.t) return finish();
  const A = n.a.length;
  if (n.p !== H.pos) {
    const k = sampleIndex(H.B.n[id].s.slice(H.bi * A, H.bi * A + A));
    H.hist.push({ who: 'bot', a: n.a[k] }); H.node = n.c[k]; return advance();
  }
  renderTable(false);
  $('fl-prompt').innerHTML = `<b>${FNODE[id].face}</b>${H.hist.length ? ' Was machst du?' : ''}`;
  $('fl-actions').innerHTML = n.a.map((a, k) => `<button class="btn ${a === 'fold' || a === 'check' ? '' : 'primary'}" data-k="${k}">${FNODE[id].lab[a]}</button>`).join('');
  document.querySelectorAll('#fl-actions button').forEach(b => { b.onclick = () => act(+b.dataset.k); });
}
function act(k) {
  const FT = flopData().tree, id = H.node, n = FT[id], A = n.a.length;
  $('fl-actions').innerHTML = ''; $('fl-prompt').innerHTML = '';
  const ev = H.B.n[id].e.slice(H.mi * A, H.mi * A + A).map(x => x / 100), st = H.B.n[id].s.slice(H.mi * A, H.mi * A + A);
  const r = applyDecision(F(), ev, k, K_DIFF.flop);
  track('flop', id, r.q, r.loss);
  const labels = n.a.map(x => FNODE[id].lab[x]), mix = mixText(n.a, NAME, st);
  if (!r.correct) saveMistake({ mode: 'flop', spot: 'flop:' + id, pos: H.pos, me: H.me, board: H.board, extra: describe(H.me, H.board), face: FNODE[id].face, seq: seqText(), pot: FNODE[id].pot, labels, ev: ev.slice(), best: r.bi, orig: k, mix, q: r.q, model: model(H.B.expl) });
  H.dec.push({ id, k, ev, r, labels, mix, path: H.path.slice() }); H.path.push([id, k]);
  H.hist.push({ who: 'me', a: n.a[k] }); H.node = n.c[k]; advance();
}
function chart(id, path) {
  const FT = flopData().tree, side = H.pos === 'SB' ? H.B.sb : H.B.bb, n = FT[id], A = n.a.length;
  const agg = Array.from({ length: 169 }, () => ({ w: 0, a: new Float64Array(A) }));
  side.c.forEach((c, i) => {
    let w = side.w[i];
    for (const [pid, pk] of path) { const pa = FT[pid].a.length; w *= H.B.n[pid].s[i * pa + pk] / 100; }
    if (w <= 0) return;
    const cl = classOfInts(Math.floor(c / 52), c % 52);
    agg[cl].w += w; for (let k = 0; k < A; k++) agg[cl].a[k] += w * H.B.n[id].s[i * A + k] / 100;
  });
  return mixMatrix(cl => agg[cl].w > 0 ? Array.from(agg[cl].a, x => x / agg[cl].w) : null, n.a, NAME, COL, cid(H.me));
}
function finish() {
  const FT = flopData().tree, t = FT[H.node], sign = H.pos === 'SB' ? 1 : -1, fs = F();
  let ev, out;
  if (t.t === 'fold') {
    ev = sign * t.sb; H.finalPot = 0;
    const botFolded = (t.sb > 0) === (H.pos === 'SB');
    out = `${botFolded ? 'Der Bot foldet' : 'Du foldest'}. ${ev > 0 ? `Du gewinnst den Pot, insgesamt <b>${sg(ev)} BB</b> für die Hand.` : `Du verlierst <b>${nf(-ev)} BB</b> in dieser Hand.`} Der Bot hatte ${strCards(H.bot)}: ${describe(H.bot, H.board)}.`;
  } else {
    const eq = exactEq(H.meI, H.botI, H.board.map(cint)); H.finalPot = t.pot;
    ev = t.pot * (H.pos === 'SB' ? fR(eq, t.d) : 1 - fR(1 - eq, t.d)) - t.inv;
    out = `Die Hand geht zum Turn, Pot ${nf(t.pot, 2)} BB. Der Bot hat ${strCards(H.bot)} (${describe(H.bot, H.board)}). Deine Equity gegen genau diese Hand: <b>${pc1(eq)}</b>. Laut Modell ist dein Anteil <b>${sg(ev)} BB</b> wert (ganze Hand, inklusive 2,5 BB preflop).`;
  }
  fs.ev += ev; fs.hands++;
  last = H.dec.length ? H.dec.reduce((s, d) => s + d.r.delta, 0) : null;
  if (H.dec.length) { fs.hist.push(Math.round(fs.rating)); fs.hist = fs.hist.slice(-200); }
  pushLog(fs, { pos: H.pos, lab: strCards(H.board) + ' · ' + strCards(H.me), seq: seqText(), q: worstOf(H.dec.map(d => d.r.q)) });
  persist(); renderTable(true); render();
  const side = H.pos === 'SB' ? H.B.sb : H.B.bb, eqR = side.eq[H.mi] / 1000;
  const blocks = H.dec.map((d, i) => decisionBlock({ index: i, face: FNODE[d.id].face, r: d.r, labels: d.labels, ev: d.ev, chosen: d.k, mixText: d.mix, chart: chart(d.id, d.path), chartTitle: 'Strategie-Chart deiner Range für diese Situation' })).join('');
  analysis('fl-fb', `<p>Auf dem Flop hattest du <b>${pc1(eqR)}</b> Equity gegen die gesamte Range des Bots. EV-Werte gelten für die ganze Hand, inklusive der 2,5 BB, die du preflop investiert hast.</p>${blocks || '<p>In dieser Hand musstest du nichts entscheiden.</p>'}<p style="border-top:1px solid var(--line);padding-top:12px">${out}</p>${modelNote(model(H.B.expl))}`, 'Nächste Hand', newHand);
}

export function initFlop() {
  render(); newHand();
  onReset(() => { last = null; render(); newHand(); });
}
