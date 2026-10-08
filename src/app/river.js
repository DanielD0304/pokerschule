// River-Training: exakt gelöste River-Spots.
import { RANKS, SUITS, icard, cid, classOfInts } from '../core/cards.js';
import { evalCards, handName, compare } from '../core/evaluator.js';
import { applyDecision, K_DIFF } from '../core/rating.js';
import { state, persist, renderHeader, onReset } from './store.js';
import { track, saveMistake } from './progress.js';
import { riverData } from './data.js';
import { $, cardsHTML, BACKS, nf, n2, sg, pc1, strCards, ratingCard, evCards, logHTML, pushLog, worstOf, decisionBlock, mixText, mixMatrix, modelNote, analysis, pickW, sampleIndex } from './dom.js';

const NAME = { check: 'Check', lead: 'Bet ½', b33: 'Bet ⅓', b75: 'Bet ¾', b150: 'Overbet', fold: 'Fold', call: 'Call', raise: 'Raise' };
const COL = { check: 'var(--surface-2)', fold: 'var(--surface-2)', call: 'var(--teal)', lead: 'var(--gold)', b33: 'var(--gold)', b75: 'var(--accent)', b150: 'var(--warn)', raise: 'var(--bad)' };
const FRAC = { b33: '⅓ Pot', b75: '¾ Pot', b150: '1,5× Pot', lead: '½ Pot' };
const model = expl => `Exakt gelöst für diesen Spielbaum, ausnutzbar um ${nf(expl, 3)} % des Pots. Grenze: Die Ranges stammen aus den vereinfachten früheren Stufen, und die Turn-Linie Check-Check ist vorgegeben.`;
let H = null, last = null;
const R = () => state.river;

function label(T, id, a) {
  const m = T[id].amt || {};
  if (a === 'check' || a === 'fold') return NAME[a];
  if (a === 'call') return `Call ${n2(m.call)}`;
  if (a === 'raise') return `Raise auf ${n2(m.raise)}`;
  return `${a === 'b150' ? 'Overbet' : 'Bet'} ${n2(m[a])} (${FRAC[a]})`;
}
function face(id) {
  const lastAct = H.hist[H.hist.length - 1];
  if (!lastAct) return id === 'r_root' ? 'Du handelst zuerst.' : '';
  if (lastAct.a === 'check') return 'Der Bot checkt zu dir.';
  if (lastAct.a === 'raise') return `Der Bot erhöht auf ${n2(lastAct.amt)} BB.`;
  return `Der Bot setzt ${n2(lastAct.amt)} BB (${FRAC[lastAct.a]}).`;
}
const amountOf = (T, id, a) => { const m = T[id].amt || {}; return a === 'call' ? m.call : a === 'raise' ? m.raise : m[a] || 0; };

function render() {
  const rs = R();
  $('rv-stats').innerHTML = ratingCard(rs, last) + evCards(rs, 'Bilanz', `BB, ${rs.hands} Hände (am River gibt es kein Glück mehr)`);
  $('rv-log').innerHTML = logHTML(rs.log);
  renderHeader();
}
const seqText = () => H.hist.map(x => `${x.who === 'me' ? 'Du' : 'Bot'} ${NAME[x.a]}`).join(' · ');
function renderTable(reveal) {
  const botPos = H.pos === 'SB' ? 'BB' : 'SB';
  const line = `Preflop: SB erhöht, BB callt · Flop: BB checkt, SB setzt ${H.sp.line === 'b75' ? '¾' : '⅓'} Pot, BB callt · Turn: Check, Check`;
  $('rv-table').innerHTML = `<div class="seat"><span class="label">Bot · ${botPos} · ${botPos === 'SB' ? 'in Position' : 'out of position'}</span><div class="row">${reveal ? cardsHTML(H.bot) : BACKS}</div></div>
    <span class="label" style="max-width:52ch;text-transform:none;letter-spacing:0;font-size:.8rem">${line}</span>
    <div class="row">${cardsHTML(H.board)}</div>
    <span class="potline">Pot ${nf(H.pot, 2)} BB</span>
    <span style="font-size:.9rem;min-height:1.4em">${seqText() || '&nbsp;'}</span>
    <div class="seat"><div class="row">${cardsHTML(H.me)}</div><span class="label">Du · ${H.pos} · ${H.pos === 'SB' ? 'in Position' : 'out of position'}</span><span style="font-size:.9rem">${handName(evalCards([...H.me, ...H.board]))}</span></div>`;
}

function newHand() {
  const RD = riverData(), sp = RD.spots[(Math.random() * RD.spots.length) | 0];
  const board = [0, 2, 4, 6, 8].map(k => ({ r: RANKS.indexOf(sp.board[k]) + 2, s: SUITS.indexOf(sp.board[k + 1]) }));
  const pos = R().hands % 2 === 0 ? 'BB' : 'SB', mine = pos === 'SB' ? sp.sb : sp.bb, his = pos === 'SB' ? sp.bb : sp.sb;
  const mi = pickW(mine.c, mine.w, () => true), mc = mine.c[mi], ma = Math.floor(mc / 52), mb = mc % 52;
  const free = c => { const a = Math.floor(c / 52), b = c % 52; return a !== ma && a !== mb && b !== ma && b !== mb; };
  const bi = pickW(his.c, his.w, free), bc = his.c[bi];
  H = { sp, T: sp.tree, board, pos, mi, bi, me: [icard(ma), icard(mb)], bot: [icard(Math.floor(bc / 52)), icard(bc % 52)], node: 'r_root', hist: [], dec: [], path: [], pot: sp.P };
  // Anteil der Bot-Range, den du schlägst
  const my = evalCards([...H.me, ...board]); let w = 0, beat = 0;
  his.c.forEach((c, i) => { if (!free(c)) return; const d = compare(my, evalCards([icard(Math.floor(c / 52)), icard(c % 52), ...board])); w += his.w[i]; beat += his.w[i] * (d > 0 ? 1 : d === 0 ? .5 : 0); });
  H.beat = w ? beat / w : 0;
  $('rv-fb').innerHTML = ''; advance();
}
function advance() {
  const T = H.T, id = H.node, n = T[id];
  if (n.t) return finish();
  const A = n.a.length;
  if (n.p !== H.pos) {
    const k = sampleIndex(H.sp.n[id].s.slice(H.bi * A, H.bi * A + A)), amt = amountOf(T, id, n.a[k]);
    H.pot += amt; H.hist.push({ who: 'bot', a: n.a[k], amt }); H.node = n.c[k]; return advance();
  }
  renderTable(false);
  $('rv-prompt').innerHTML = `<b>${face(id)}</b>${H.hist.length ? ' Was machst du?' : ''}`;
  $('rv-actions').innerHTML = n.a.map((a, k) => `<button class="btn ${a === 'fold' || a === 'check' ? '' : 'primary'}" data-k="${k}">${label(T, id, a)}</button>`).join('');
  document.querySelectorAll('#rv-actions button').forEach(b => { b.onclick = () => act(+b.dataset.k); });
}
function act(k) {
  const T = H.T, id = H.node, n = T[id], A = n.a.length, f = face(id);
  $('rv-actions').innerHTML = ''; $('rv-prompt').innerHTML = '';
  const ev = H.sp.n[id].e.slice(H.mi * A, H.mi * A + A).map(x => x / 100), st = H.sp.n[id].s.slice(H.mi * A, H.mi * A + A);
  const r = applyDecision(R(), ev, k, K_DIFF.river);
  track('river', id, r.q, r.loss);
  const labels = n.a.map(a => label(T, id, a)), mix = mixText(n.a, NAME, st);
  if (!r.correct) saveMistake({ mode: 'river', spot: 'river:' + id, pos: H.pos, me: H.me, board: H.board, extra: handName(evalCards([...H.me, ...H.board])), face: f, seq: seqText(), pot: H.pot, labels, ev: ev.slice(), best: r.bi, orig: k, mix, q: r.q, model: model(H.sp.expl) });
  H.dec.push({ id, k, ev, r, face: f, labels, mix, path: H.path.slice() }); H.path.push([id, k]);
  const amt = amountOf(T, id, n.a[k]); H.pot += amt; H.hist.push({ who: 'me', a: n.a[k], amt }); H.node = n.c[k]; advance();
}
function chart(id, path) {
  const side = H.pos === 'SB' ? H.sp.sb : H.sp.bb, n = H.T[id], A = n.a.length;
  const agg = Array.from({ length: 169 }, () => ({ w: 0, a: new Float64Array(A) }));
  side.c.forEach((c, i) => {
    let w = side.w[i];
    for (const [pid, pk] of path) { const pa = H.T[pid].a.length; w *= H.sp.n[pid].s[i * pa + pk] / 100; }
    if (w <= 0) return;
    const cl = classOfInts(Math.floor(c / 52), c % 52);
    agg[cl].w += w; for (let kk = 0; kk < A; kk++) agg[cl].a[kk] += w * H.sp.n[id].s[i * A + kk] / 100;
  });
  return mixMatrix(cl => agg[cl].w > 0 ? Array.from(agg[cl].a, x => x / agg[cl].w) : null, n.a, NAME, COL, cid(H.me));
}
function finish() {
  const t = H.T[H.node], sign = H.pos === 'SB' ? 1 : -1, rs = R();
  let ev, out;
  if (t.t === 'fold') {
    ev = sign * t.sb;
    const botFolded = (t.sb > 0) === (H.pos === 'SB');
    out = `${botFolded ? 'Der Bot foldet' : 'Du foldest'}. ${ev > 0 ? `Du gewinnst den Pot, insgesamt <b>${sg(ev)} BB</b> für die Hand.` : `Du verlierst <b>${nf(-ev)} BB</b> in dieser Hand.`} Der Bot hatte ${strCards(H.bot)}: ${handName(evalCards([...H.bot, ...H.board]))}.`;
  } else {
    const a = evalCards([...H.me, ...H.board]), b = evalCards([...H.bot, ...H.board]), d = compare(a, b);
    ev = d > 0 ? t.pot - t.inv : d < 0 ? -t.inv : t.pot / 2 - t.inv;
    out = `Showdown, Pot ${nf(t.pot, 2)} BB. Du: ${handName(a)}. Bot (${strCards(H.bot)}): ${handName(b)}. ${d > 0 ? 'Du gewinnst' : d < 0 ? 'Der Bot gewinnt' : 'Split Pot'}: <b>${sg(ev)} BB</b> für die ganze Hand.`;
  }
  rs.ev += ev; rs.hands++;
  last = H.dec.length ? H.dec.reduce((s, d) => s + d.r.delta, 0) : null;
  if (H.dec.length) { rs.hist.push(Math.round(rs.rating)); rs.hist = rs.hist.slice(-200); }
  pushLog(rs, { pos: H.pos, lab: strCards(H.board) + ' · ' + strCards(H.me), seq: seqText(), q: worstOf(H.dec.map(d => d.r.q)) });
  persist(); renderTable(true); render();
  const blocks = H.dec.map((d, i) => decisionBlock({ index: i, face: d.face, r: d.r, labels: d.labels, ev: d.ev, chosen: d.k, mixText: d.mix, chart: chart(d.id, d.path), chartTitle: 'Strategie-Chart deiner Range für diese Situation' })).join('');
  analysis('rv-fb', `<p>Deine Hand schlägt <b>${pc1(H.beat)}</b> der Range, mit der der Bot den River erreicht. EV-Werte gelten für die ganze Hand.</p>${blocks || '<p>In dieser Hand musstest du nichts entscheiden.</p>'}<p style="border-top:1px solid var(--line);padding-top:12px">${out}</p>${modelNote(model(H.sp.expl))}`, 'Nächste Hand', newHand);
}

export function initRiver() {
  render(); newHand();
  onReset(() => { last = null; render(); newHand(); });
}
