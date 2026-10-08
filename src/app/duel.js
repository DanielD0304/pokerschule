// Preflop-Duell heads-up mit 100 BB gegen das Gleichgewicht des vereinfachten Preflop-Baums.
import { deck, cint, cid, idLabel, CMB } from '../core/cards.js';
import { eval7, best5, handName } from '../core/evaluator.js';
import { mcEq } from '../core/equity.js';
import { applyDecision, K_DIFF } from '../core/rating.js';
import { fR } from '../core/hutree.js';
import { state, persist, renderHeader, onReset } from './store.js';
import { track, saveMistake } from './progress.js';
import { hu } from './data.js';
import { $, cardsHTML, BACKS, boardHTML, nf, sg, pc1, ratingCard, evCards, logHTML, pushLog, worstOf, decisionBlock, mixText, mixMatrix, modelNote, analysis, sampleIndex } from './dom.js';

const NODE = {
  root: { pot: 1.5, face: 'Du bist im Small Blind (Button) und handelst zuerst.', lab: { fold: 'Fold', raise: 'Raise auf 2,5' } },
  vsOpen: { pot: 3.5, face: 'Der Bot erhöht auf 2,5 BB.', lab: { fold: 'Fold', call: 'Call 1,5', '3bet': '3-Bet auf 10' } },
  vs3b: { pot: 12.5, face: 'Der Bot 3-bettet auf 10 BB.', lab: { fold: 'Fold', call: 'Call 7,5', '4bet': '4-Bet auf 22' } },
  vs4b: { pot: 32, face: 'Der Bot 4-bettet auf 22 BB.', lab: { fold: 'Fold', call: 'Call 12', jam: 'All-in (100)' } },
  vsJam: { pot: 122, face: 'Der Bot geht all-in mit 100 BB.', lab: { fold: 'Fold', call: 'Call 78' } },
};
const COL = { fold: 'var(--surface-2)', call: 'var(--teal)', raise: 'var(--accent)', '3bet': 'var(--accent)', '4bet': 'var(--accent)', jam: 'var(--bad)' };
const NAME = { fold: 'Fold', call: 'Call', raise: 'Raise', '3bet': '3-Bet', '4bet': '4-Bet', jam: 'All-in' };
const MODEL = 'Gleichgewicht eines vereinfachten Preflop-Baums (feste Größen 2,5 / 10 / 22 / all-in, keine Limps). Nach dem Flop zählt die Equity-Realisierung statt echter Setzrunden.';
let H = null, last = null;
const D = () => state.duel;

function render() {
  const ds = D();
  $('du-stats').innerHTML = ratingCard(ds, last) + evCards(ds, 'EV-Bilanz', `BB glücksbereinigt, ${ds.hands} Hände`);
  $('du-log').innerHTML = logHTML(ds.log);
  renderHeader();
}
const seqText = () => H.hist.map(x => `${x.who === 'me' ? 'Du' : 'Bot'} ${NAME[x.a]}`).join(' · ');
function renderTable(reveal, boardN) {
  const { tree } = hu(), pot = tree[H.node].t ? H.finalPot : NODE[H.node].pot, botPos = H.pos === 'SB' ? 'BB' : 'SB';
  $('du-table').innerHTML = `<div class="seat"><span class="label">Bot · ${botPos} · 100 BB</span><div class="row">${reveal ? cardsHTML(H.bot) : BACKS}</div></div>
    <div class="row">${boardHTML(H.board, boardN)}</div>
    <span class="potline">Pot ${nf(pot, 1)} BB</span>
    <span style="font-size:.9rem;min-height:1.4em">${seqText() || '&nbsp;'}</span>
    <div class="seat"><div class="row">${cardsHTML(H.me)}</div><span class="label">Du · ${H.pos} · 100 BB · ${idLabel(cid(H.me))}</span></div>`;
}
function stratMatrix(id, hl) {
  const { tree, strat } = hu(), n = tree[id];
  return mixMatrix(h => strat[id][h], n.a, NAME, COL, hl);
}

function newHand() {
  const d = deck();
  H = { me: [d[0], d[1]], bot: [d[2], d[3]], board: d.slice(4, 9), pos: D().hands % 2 === 0 ? 'SB' : 'BB', node: 'root', opp: new Array(169).fill(1), hist: [], dec: [] };
  $('du-fb').innerHTML = ''; advance();
}
function advance() {
  const { tree, strat } = hu(), id = H.node, n = tree[id];
  if (n.t) return finish();
  if (n.p !== H.pos) {
    const k = sampleIndex(strat[id][cid(H.bot)]);
    H.opp = H.opp.map((x, o) => x * strat[id][o][k]); H.hist.push({ who: 'bot', a: n.a[k] }); H.node = n.c[k];
    return advance();
  }
  renderTable(false, 0);
  $('du-prompt').innerHTML = `<b>${NODE[id].face}</b>${H.hist.length ? ' Was machst du?' : ''}`;
  $('du-actions').innerHTML = n.a.map((a, k) => `<button class="btn ${a === 'fold' ? '' : 'primary'}" data-k="${k}">${NODE[id].lab[a]}</button>`).join('');
  document.querySelectorAll('#du-actions button').forEach(b => { b.onclick = () => act(+b.dataset.k); });
}
function act(k) {
  const HU = hu(), { tree, strat } = HU, id = H.node, n = tree[id], h = cid(H.me);
  $('du-actions').innerHTML = ''; $('du-prompt').innerHTML = '';
  const ev = HU.nodeEVs(id, H.pos, h, H.opp), r = applyDecision(D(), ev, k, K_DIFF.duel);
  track('duel', id, r.q, r.loss);
  const labels = n.a.map(x => NODE[id].lab[x]), mix = mixText(n.a, NAME, strat[id][h]);
  if (!r.correct) saveMistake({ mode: 'duel', spot: 'duel:' + id, pos: H.pos, me: H.me, board: [], face: NODE[id].face, seq: seqText(), pot: NODE[id].pot, labels, ev: ev.slice(), best: r.bi, orig: k, mix, q: r.q, model: MODEL });
  let reach = 0; for (let o = 0; o < 169; o++) reach += CMB[o].length * H.opp[o];
  H.dec.push({ id, k, ev, r, h, labels, mix, reach: reach / 1326, face: NODE[id].face });
  H.hist.push({ who: 'me', a: n.a[k] }); H.node = n.c[k]; advance();
}
function finish() {
  const { tree } = hu(), t = tree[H.node], bo = cid(H.bot), sign = H.pos === 'SB' ? 1 : -1, ds = D();
  let ev, out, boardN = 0;
  const amt = x => nf(x, x % 1 ? 1 : 0);
  if (t.t === 'fold') {
    ev = sign * t.sb; H.finalPot = 0;
    const botFolded = (t.sb > 0) === (H.pos === 'SB');
    out = `${botFolded ? 'Der Bot foldet' : 'Du foldest'}. ${ev > 0 ? `Du gewinnst <b>${amt(ev)} BB</b>.` : `Du verlierst <b>${amt(-ev)} BB</b>.`} Der Bot hatte ${idLabel(bo)}.`;
  } else {
    const mi = H.me.map(cint), oi = H.bot.map(cint), eq = mcEq(mi, oi); H.finalPot = t.pot;
    if (t.t === 'sd') {
      const share = H.pos === 'SB' ? fR(eq, t.d) : 1 - fR(1 - eq, t.d); ev = t.pot * share - t.inv;
      out = `Die Hand geht zum Flop, Pot ${amt(t.pot)} BB. Gegen ${idLabel(bo)} hast du <b>${pc1(eq)}</b> Equity, ${H.pos === 'SB' ? 'in Position' : 'außer Position'}. Laut Modell ist dein Anteil am Pot <b>${sg(ev)} BB</b> wert. Postflop wird nicht gespielt.`;
    } else {
      ev = 200 * eq - 100; boardN = 5;
      const bd = H.board.map(cint), x = eval7([...mi, ...bd]), y = eval7([...oi, ...bd]), real = x > y ? 100 : x < y ? -100 : 0;
      out = `All-in gegen ${idLabel(bo)}: deine Equity <b>${pc1(eq)}</b>. Du hast ${handName(best5([...H.me, ...H.board]).score)}, der Bot ${handName(best5([...H.bot, ...H.board]).score)}. ${real > 0 ? 'Du gewinnst <b>100 BB</b>.' : real < 0 ? 'Du verlierst <b>100 BB</b>.' : 'Split Pot.'} Glücksbereinigt: <b>${sg(ev)} BB</b>.`;
    }
  }
  ds.ev += ev; ds.hands++;
  last = H.dec.length ? H.dec.reduce((s, d) => s + d.r.delta, 0) : null;
  if (H.dec.length) { ds.hist.push(Math.round(ds.rating)); ds.hist = ds.hist.slice(-200); }
  pushLog(ds, { pos: H.pos, lab: idLabel(cid(H.me)), seq: seqText(), q: worstOf(H.dec.map(d => d.r.q)) });
  persist(); renderTable(true, boardN); render();
  const blocks = H.dec.map((d, i) => decisionBlock({
    index: i, face: d.face, r: d.r, labels: d.labels, ev: d.ev, chosen: d.k, mixText: d.mix,
    extra: d.id === 'root' ? '' : `Der Bot kommt mit etwa <b>${pc1(d.reach)}</b> seiner Hände in diese Situation.`,
    chart: stratMatrix(d.id, d.h),
  })).join('');
  analysis('du-fb', `${blocks || '<p>In dieser Hand musstest du nichts entscheiden.</p>'}<p style="border-top:1px solid var(--line);padding-top:12px">${out}</p>${modelNote(MODEL)}`, 'Nächste Hand', newHand);
}

export function initDuel() {
  render(); newHand();
  onReset(() => { last = null; render(); newHand(); });
}
