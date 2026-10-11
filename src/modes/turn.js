// Turn-Training im Single-Raised-Pot: zweite Barrel, Check-Back, Verteidigung gegen Turn-Bets (Roadmap 04, B-03).
// Gelöst samt River-Spiel auf allen River-Karten; trainiert wird die Turn-Entscheidung. Je Flop-Board ein Spot,
// gezogen nach Häufigkeit des Flops, je Spot erst bei Bedarf geladen.
import { icard, cid, classOfInts, cint } from '../core/cards.js';
import { eval7, evalCards, handName } from '../core/evaluator.js';
import { applyDecision, K_DIFF } from '../core/rating.js';
import { pickBoard } from '../core/flops.js';
import { state, persist, renderHeader } from './store.js';
import { track, saveMistake } from './progress.js';
import { turnIndex, turnSpot, loadTurnSpot } from './data.js';
import { describe } from './flop.js';
import { $, cardsHTML, BACKS, SLOT, nf, n2, sg, pc1, strCards, ratingCard, evCards, logHTML, pushLog, worstOf, decisionBlock, mixText, mixMatrix, modelNote, analysis, pickW, sampleIndex } from './dom.js';

const NAME = { check: 'Check', lead: 'Bet ½', b33: 'Bet ⅓', b75: 'Bet ¾', b150: 'Overbet', fold: 'Fold', call: 'Call', raise: 'Raise' };
const COL = { check: 'var(--surface-2)', fold: 'var(--surface-2)', call: 'var(--teal)', lead: 'var(--gold)', b33: 'var(--gold)', b75: 'var(--accent)', b150: 'var(--warn)', raise: 'var(--bad)' };
const FRAC = { b33: '⅓ Pot', b75: '¾ Pot', b150: '1,5× Pot', lead: '½ Pot' };
const model = expl => `Turn und River exakt gelöst für diesen Spielbaum (River auf allen 44 Karten mit Check, ⅓, ¾, Overbet und Raise), ausnutzbar um ${nf(expl, 3)} % des Pots. Grenzen: Die Ranges stammen aus den vereinfachten früheren Stufen, und Linien, die im Gleichgewicht praktisch nie vorkommen (etwa ein Lead des Big Blind), sind weniger genau gelöst.`;
let H = null, last = null, seq = 0, upcoming = null;
const TU = () => state.turn;

function label(T, id, a) {
  const m = T[id].amt || {};
  if (a === 'check' || a === 'fold') return NAME[a];
  if (a === 'call') return `Call ${n2(m.call)}`;
  if (a === 'raise') return `Raise auf ${n2(m.raise)}`;
  return `${a === 'b150' ? 'Overbet' : 'Bet'} ${n2(m[a])} (${FRAC[a]})`;
}
function face(id) {
  const lastAct = H.hist[H.hist.length - 1];
  if (!lastAct) return id === 'u_root' ? 'Du handelst zuerst.' : '';
  if (lastAct.a === 'check') return 'Der Bot checkt zu dir.';
  if (lastAct.a === 'raise') return `Der Bot erhöht auf ${n2(lastAct.amt)} BB.`;
  return `Der Bot setzt ${n2(lastAct.amt)} BB (${FRAC[lastAct.a]}).`;
}
const amountOf = (T, id, a) => { const m = T[id].amt || {}; return a === 'call' ? m.call : a === 'raise' ? m.raise : m[a] || 0; };
const parseBoard = s => Array.from({ length: s.length / 2 }, (_, k) => icard('23456789TJQKA'.indexOf(s[2 * k]) * 4 + 'shdc'.indexOf(s[2 * k + 1])));

function render() {
  const ts = TU();
  $('tu-stats').innerHTML = ratingCard(ts, last) + evCards(ts, 'EV-Bilanz', `BB, ${ts.hands} Hände (River ohne weiteres Setzen gerechnet)`);
  $('tu-log').innerHTML = logHTML(ts.log);
  renderHeader();
}
const seqText = () => H.hist.map(x => `${x.who === 'me' ? 'Du' : 'Bot'} ${NAME[x.a]}`).join(' · ');
function renderTable(reveal) {
  const botPos = H.pos === 'SB' ? 'BB' : 'SB';
  const line = `Preflop: SB erhöht, BB callt · Flop: BB checkt, SB setzt ${H.sp.line === 'b75' ? '¾' : '⅓'} Pot, BB callt`;
  $('tu-table').innerHTML = `<div class="seat"><span class="label">Bot · ${botPos} · ${botPos === 'SB' ? 'in Position' : 'out of position'}</span><div class="row">${reveal ? cardsHTML(H.bot) : BACKS}</div></div>
    <span class="label" style="max-width:52ch;text-transform:none;letter-spacing:0;font-size:.8rem">${line}</span>
    <div class="row">${cardsHTML(H.board)}${SLOT}</div>
    <span class="potline">Pot ${nf(H.pot, 2)} BB</span>
    <span style="font-size:.9rem;min-height:1.4em">${seqText() || '&nbsp;'}</span>
    <div class="seat"><div class="row">${cardsHTML(H.me)}</div><span class="label">Du · ${H.pos} · ${H.pos === 'SB' ? 'in Position' : 'out of position'}</span><span style="font-size:.9rem">${describe(H.me, H.board)}</span></div>`;
}

/** Equity von Hand a gegen Hand b über alle River-Karten (Karten als Zahlen). */
function riverEq(a, b, board) {
  const used = new Set([...a, ...b, ...board]), x = new Int32Array(7), y = new Int32Array(7);
  for (let k = 0; k < 4; k++) { x[k + 2] = board[k]; y[k + 2] = board[k]; }
  x[0] = a[0]; x[1] = a[1]; y[0] = b[0]; y[1] = b[1];
  let w = 0, n = 0;
  for (let r = 0; r < 52; r++) {
    if (used.has(r)) continue;
    x[6] = r; y[6] = r; const p = eval7(x), q = eval7(y);
    w += p > q ? 1 : p === q ? .5 : 0; n++;
  }
  return w / n;
}

const choose = () => pickBoard(turnIndex().spots.map(s => ({ ...s, board: s.spot, tags: [] })), Math.random);
function prefetch() { upcoming = choose(); loadTurnSpot(upcoming.spot).catch(() => { upcoming = null; }); }

async function newHand() {
  const my = ++seq, meta = upcoming || choose();
  upcoming = null;
  $('tu-fb').innerHTML = ''; $('tu-actions').innerHTML = ''; $('tu-prompt').innerHTML = '';
  let sp = turnSpot(meta.spot);
  if (!sp) {
    $('tu-table').innerHTML = '<p role="status">Lade Turn-Spot …</p>';
    try { sp = await loadTurnSpot(meta.spot); } catch (e) {
      if (my !== seq || !$('tu-table')) return;
      $('tu-table').innerHTML = `<p role="alert">${e.message}</p>`;
      $('tu-actions').innerHTML = '<button class="btn primary" id="tu-retry">Erneut versuchen</button>';
      $('tu-retry').onclick = () => { upcoming = meta; newHand(); };
      return;
    }
    if (my !== seq || !$('tu-table')) return;
  }
  prefetch();
  const board = parseBoard(sp.board), boardI = board.map(cint);
  const pos = TU().hands % 2 === 0 ? 'BB' : 'SB', mine = pos === 'SB' ? sp.sb : sp.bb, his = pos === 'SB' ? sp.bb : sp.sb;
  const mi = pickW(mine.c, mine.w, () => true), mc = mine.c[mi], ma = Math.floor(mc / 52), mb = mc % 52;
  const free = c => { const a = Math.floor(c / 52), b = c % 52; return a !== ma && a !== mb && b !== ma && b !== mb; };
  const bi = pickW(his.c, his.w, free), bc = his.c[bi];
  H = { sp, T: sp.tree, board, boardI, pos, mi, bi, me: [icard(ma), icard(mb)], meI: [ma, mb], bot: [icard(Math.floor(bc / 52)), icard(bc % 52)], botI: [Math.floor(bc / 52), bc % 52], node: 'u_root', hist: [], dec: [], path: [], pot: sp.P };
  // Equity gegen die ganze Range des Bots auf dem Turn (über alle River-Karten)
  let w = 0, e = 0;
  his.c.forEach((c, i) => { if (!free(c) || !his.w[i]) return; const o = [Math.floor(c / 52), c % 52]; if (boardI.includes(o[0]) || boardI.includes(o[1])) return; w += his.w[i]; e += his.w[i] * riverEq(H.meI, o, boardI); });
  H.eqRange = w ? e / w : 0;
  advance();
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
  $('tu-prompt').innerHTML = `<b>${face(id)}</b>${H.hist.length ? ' Was machst du?' : ''}`;
  $('tu-actions').innerHTML = n.a.map((a, k) => `<button class="btn ${a === 'fold' || a === 'check' ? '' : 'primary'}" data-k="${k}">${label(T, id, a)}</button>`).join('');
  document.querySelectorAll('#tu-actions button').forEach(b => { b.onclick = () => act(+b.dataset.k); });
}
function act(k) {
  const T = H.T, id = H.node, n = T[id], A = n.a.length, f = face(id);
  $('tu-actions').innerHTML = ''; $('tu-prompt').innerHTML = '';
  const ev = H.sp.n[id].e.slice(H.mi * A, H.mi * A + A).map(x => x / 100), st = H.sp.n[id].s.slice(H.mi * A, H.mi * A + A);
  const r = applyDecision(TU(), ev, k, K_DIFF.turn);
  track('turn', id, r.q, r.loss);
  const labels = n.a.map(a => label(T, id, a)), mix = mixText(n.a, NAME, st);
  if (!r.correct) saveMistake({ mode: 'turn', spot: 'turn:' + id, pos: H.pos, me: H.me, board: H.board, extra: describe(H.me, H.board), face: f, seq: seqText(), pot: H.pot, labels, ev: ev.slice(), best: r.bi, orig: k, mix, q: r.q, model: model(H.sp.expl) });
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
  const t = H.T[H.node], sign = H.pos === 'SB' ? 1 : -1, ts = TU();
  let ev, out;
  if (t.t === 'fold') {
    ev = sign * t.sb;
    const botFolded = (t.sb > 0) === (H.pos === 'SB');
    out = `${botFolded ? 'Der Bot foldet' : 'Du foldest'}. ${ev > 0 ? `Du gewinnst den Pot, insgesamt <b>${sg(ev)} BB</b> für die Hand.` : `Du verlierst <b>${nf(-ev)} BB</b> in dieser Hand.`} Der Bot hatte ${strCards(H.bot)}: ${handName(evalCards([...H.bot, ...H.board]))}.`;
  } else {
    // Die Hand geht zum River. Gelöst ist das River-Spiel nur als Ganzes; für diese eine Hand rechnen wir ohne weiteres Setzen.
    const eq = riverEq(H.meI, H.botI, H.boardI), pot = 2 * t.inv;
    ev = pot * eq - t.inv;
    out = `Die Hand geht zum River, Pot ${nf(pot, 2)} BB. Der Bot hat ${strCards(H.bot)} (${describe(H.bot, H.board)}). Deine Equity gegen genau diese Hand über alle River-Karten: <b>${pc1(eq)}</b>. Ohne weiteres Setzen am River wäre dein Anteil <b>${sg(ev)} BB</b> wert (ganze Hand). Die EVs in der Analyse rechnen das River-Spiel beider Seiten mit ein.`;
  }
  ts.ev += ev; ts.hands++;
  last = H.dec.length ? H.dec.reduce((s, d) => s + d.r.delta, 0) : null;
  if (H.dec.length) { ts.hist.push(Math.round(ts.rating)); ts.hist = ts.hist.slice(-200); }
  pushLog(ts, { pos: H.pos, lab: strCards(H.board) + ' · ' + strCards(H.me), seq: seqText(), q: worstOf(H.dec.map(d => d.r.q)) });
  persist(); renderTable(true); render();
  const blocks = H.dec.map((d, i) => decisionBlock({ index: i, face: d.face, r: d.r, labels: d.labels, ev: d.ev, chosen: d.k, mixText: d.mix, chart: chart(d.id, d.path), chartTitle: 'Strategie-Chart deiner Range für diese Situation' })).join('');
  analysis('tu-fb', `<p>Auf dem Turn hattest du <b>${pc1(H.eqRange)}</b> Equity gegen die gesamte Range des Bots (über alle River-Karten). EV-Werte gelten für die ganze Hand und rechnen das beste River-Spiel beider Seiten ein.</p>${blocks || '<p>In dieser Hand musstest du nichts entscheiden.</p>'}<p style="border-top:1px solid var(--line);padding-top:12px">${out}</p>${modelNote(model(H.sp.expl))}`, 'Nächste Hand', newHand);
}

export function mountTurn() {
  seq++; upcoming = null; // beim erneuten Öffnen keine alte Hand fortsetzen
  render(); newHand();
}
