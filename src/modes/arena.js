// Push/Fold-Arena: Heads-up-Match mit kurzen Stacks gegen einen Bot-Stil.
import { deck, cint, cid, idLabel } from '../core/cards.js';
import { eval7, best5, handName } from '../core/evaluator.js';
import { mcEq } from '../core/equity.js';
import { applyDecision, K_DIFF } from '../core/rating.js';
import { evalSpot } from '../core/pushfold.js';
import { state, persist, renderHeader } from './store.js';
import { track, saveMistake } from './progress.js';
import { tables, bots } from './data.js';
import { $, cardsHTML, BACKS, boardHTML, b1, sg, pc1, ratingCard, logHTML, pushLog, decisionBlock, modelNote, analysis, setButtons } from './dom.js';

const ACT = { push: 'All-in', fold: 'Fold', call: 'Call' };
const MODEL = 'Exakte Preflop-Equity aller 169 Starthände gegen die Strategie des gewählten Bots. Grenze: Es gibt nur All-in oder Fold.';
let hand = null, lastDelta = null;
const A = () => state.arena;

function render() {
  const ar = A();
  $('ar-stats').innerHTML = ratingCard(ar, lastDelta, 'zuletzt') +
    `<div class="stat"><span class="k">Matches</span><span class="v">${ar.mw} : ${ar.m - ar.mw}</span><span class="d">gewonnen : verloren</span></div>
     <div class="stat"><span class="k">Glücksbereinigt</span><span class="v ${ar.ev > 0 ? 'up' : ar.ev < 0 ? 'down' : ''}">${sg(ar.ev, 1)}</span><span class="d">BB über ${ar.hands} Hände (nach Karten: ${sg(ar.real, 1)})</span></div>`;
  $('ar-log').innerHTML = logHTML(ar.log);
  renderHeader();
}

function seat(who, cards, stack, bet, betLabel, pos, isMe) {
  return `<div class="seat2 ${isMe ? 'me' : ''}">
    <div class="who"><b>${who}</b><span class="posbadge">${pos === 'SB' ? 'Small Blind · Button' : 'Big Blind'}</span></div>
    <div class="row">${cards}</div>
    <div class="chips"><span>Stack <b>${b1(stack)} BB</b></span>${bet > 0 ? `<span class="bet">${betLabel}: <b>${b1(bet)} BB</b></span>` : ''}</div></div>`;
}
function renderTable(reveal, boardN) {
  const h = hand, mt = state.match; if (!h) return;
  const bot = bots()[mt.style];
  $('ar-table').innerHTML = `${seat(bot.short, reveal ? cardsHTML(h.bot) : BACKS, h.stBot, h.betBot, h.lblBot, h.pos === 'SB' ? 'BB' : 'SB', false)}
    <div class="row">${boardHTML(h.board, boardN)}</div>
    <span class="potline">Pot ${b1(h.betMe + h.betBot)} BB</span>
    ${seat('Du', cardsHTML(h.me), h.stMe, h.betMe, h.lblMe, h.pos, true)}
    <div class="arlog">${h.log.map(x => `<span>${x}</span>`).join('')}</div>`;
  $('ar-match').innerHTML = `<span>Hand <b>${mt.n}</b> im Match</span><span>Startstack ${mt.start} BB</span><span>Gegner: ${bot.name}</span><span>Effektiver Stack: <b>${b1(h.S)} BB</b></span>`;
}
const act = list => setButtons('ar-actions', list, decide);
const next = (html, label = 'Nächste Hand', fn = newHand) => analysis('ar-fb', html, label, fn);

function newMatch() {
  const start = +$('ar-start').value, style = $('ar-bot').value;
  state.match = { start, style, me: start, bot: start, n: 0, sbMe: Math.random() < .5 };
  persist(); newHand();
}
function newHand() {
  const mt = state.match;
  if (!mt || mt.me <= 0 || mt.bot <= 0) return newMatch();
  mt.n++; mt.sbMe = !mt.sbMe; persist();
  const d = deck(), pos = mt.sbMe ? 'SB' : 'BB', S = Math.min(mt.me, mt.bot);
  const sbMe = pos === 'SB', blMe = Math.min(sbMe ? .5 : 1, mt.me), blBot = Math.min(sbMe ? 1 : .5, mt.bot);
  hand = {
    S, me: [d[0], d[1]], bot: [d[2], d[3]], board: d.slice(4, 9), pos,
    stMe: mt.me - blMe, stBot: mt.bot - blBot, betMe: blMe, betBot: blBot,
    lblMe: sbMe ? 'Small Blind' : 'Big Blind', lblBot: sbMe ? 'Big Blind' : 'Small Blind',
    log: [`${sbMe ? 'Du postest' : 'Bot postet'} Small Blind 0,5 BB`, `${sbMe ? 'Bot postet' : 'Du postest'} Big Blind 1 BB`],
  };
  $('ar-fb').innerHTML = '';
  if (S < 1.5) {
    hand.log.push('Ein Stack ist so klein, dass beide automatisch all-in sind.'); act([]);
    const sdn = showdown();
    pushLog(A(), { pos, S: b1(S), lab: idLabel(cid(hand.me)), act: '–', q: null, note: 'Auto all-in' }); persist(); render();
    return afterHand('<p>' + sdn.txt + '</p>');
  }
  if (pos === 'SB') { renderTable(false, 0); act([['fold', 'Fold (−0,5 BB)'], ['push', `All-in ${b1(S)} BB`, true]]); return; }
  const bot = bots()[mt.style];
  if (Math.random() < bot.push(S)[cid(hand.bot)]) {
    hand.betBot = Math.min(S, mt.bot); hand.stBot = mt.bot - hand.betBot; hand.lblBot = 'All-in'; hand.log.push(`Bot geht all-in mit ${b1(S)} BB`);
    renderTable(false, 0); act([['fold', 'Fold (−1 BB)'], ['call', `Call ${b1(S - 1)} BB`, true]]);
    $('ar-fb').innerHTML = `<p style="text-align:center;max-width:none"><b>Der Bot geht all-in.</b> Du musst ${b1(S - 1)} BB zahlen, um ${b1(2 * S)} BB zu gewinnen.</p>`;
    return;
  }
  hand.log.push('Bot foldet im Small Blind'); settle(.5, .5); renderTable(true, 0); act([]);
  pushLog(A(), { pos: 'BB', S: b1(S), lab: idLabel(cid(hand.me)), act: '–', q: null, note: 'Bot foldet' }); persist(); render();
  afterHand(`<p>Der Bot foldet im Small Blind (mit ${idLabel(cid(hand.bot))}). Du gewinnst seinen Small Blind, 0,5 BB.</p>`);
}
function settle(real, ev) {
  const mt = state.match, ar = A();
  mt.me = Math.round((mt.me + real) * 100) / 100; mt.bot = Math.round((mt.bot - real) * 100) / 100;
  ar.real += real; ar.ev += ev; ar.hands++; persist();
}
function afterHand(html) {
  const mt = state.match, ar = A();
  if (mt.me <= .001 || mt.bot <= .001) {
    const won = mt.bot <= .001; ar.m++; if (won) ar.mw++;
    html += `<div class="matchend ${won ? 'good' : 'bad'}"><b>${won ? 'Match gewonnen!' : 'Match verloren.'}</b> Nach ${mt.n === 1 ? 'einer Hand' : mt.n + ' Händen'} ${won ? 'hat der Bot' : 'hast du'} keine Chips mehr.</div>`;
    mt.me = 0; persist(); render();
    return next(html, 'Neues Match', newMatch);
  }
  next(html + `<p class="muted">Stacks jetzt: Du ${b1(mt.me)} BB · Bot ${b1(mt.bot)} BB</p>`);
}
function showdown() {
  const h = hand, S = h.S, mt = state.match, me = h.me.map(cint), op = h.bot.map(cint), bd = h.board.map(cint);
  const eq = mcEq(me, op), x = eval7([...me, ...bd]), y = eval7([...op, ...bd]);
  const real = x > y ? S : x < y ? -S : 0, evr = S * (2 * eq - 1);
  if (h.lblMe !== 'All-in') h.lblMe = h.lblBot === 'All-in' ? 'Call' : 'All-in';
  if (h.lblBot !== 'All-in') h.lblBot = 'Call';
  h.betMe = h.betBot = S; h.stMe = mt.me - S; h.stBot = mt.bot - S;
  settle(real, evr); renderTable(true, 5);
  const mine = best5([...h.me, ...h.board]), his = best5([...h.bot, ...h.board]);
  return {
    real, evr,
    txt: `All-in gegen ${idLabel(cid(h.bot))}: Deine Equity lag bei <b>${pc1(eq)}</b>. Du hast ${handName(mine.score)}, der Bot ${handName(his.score)}. ${real > 0 ? `Du gewinnst <b>${b1(S)} BB</b>.` : real < 0 ? `Du verlierst <b>${b1(S)} BB</b>.` : 'Split Pot.'} Glücksbereinigt: <b>${sg(evr)} BB</b>.`,
  };
}

function brChart(pos, S, bot, hl) {
  const T = tables(), fr = [];
  for (let i = 0; i < 169; i++) { const r = evalSpot(T, pos, S, i, bot), k = Object.keys(r.ev); fr.push(r.ev[k[0]] > r.ev[k[1]] ? 1 : 0); }
  let o = '';
  for (let i = 12; i >= 0; i--) for (let j = 12; j >= 0; j--) {
    const id = i * 13 + j, f = fr[id], lab = idLabel(id);
    const st = f > 0 ? `background:var(--accent);color:var(--accent-ink)` : '';
    o += `<div class="${id === hl ? 'hl' : ''}" style="${st}" title="${lab}: ${f ? (pos === 'SB' ? 'All-in' : 'Call') : 'Fold'}">${lab}</div>`;
  }
  return `<div class="matrix-wrap"><div class="matrix">${o}</div></div>`;
}

function decide(a) {
  act([]);
  const h = hand, S = h.S, mi = cid(h.me), bot = bots()[state.match.style], T = tables();
  const sp = evalSpot(T, h.pos, S, mi, bot), opts = Object.keys(sp.ev), evs = opts.map(o => sp.ev[o]), chosen = opts.indexOf(a);
  const why = h.pos === 'SB'
    ? `Der ${bot.short} callt bei ${b1(S)} BB etwa <b>${pc1(sp.cp)}</b> seiner Hände. Foldet er, gewinnst du sofort 1 BB. Callt er, hat ${idLabel(mi)} gegen seine Call-Hände etwa <b>${pc1(sp.eqc)}</b> Equity. Ein Fold kostet deinen Small Blind (0,5 BB).`
    : `Der ${bot.short} geht bei ${b1(S)} BB mit etwa <b>${pc1(sp.pp)}</b> seiner Hände all-in. Gegen diese Hände hat ${idLabel(mi)} <b>${pc1(sp.eq)}</b> Equity. Du zahlst ${b1(S - 1)} BB, um ${b1(2 * S)} BB zu gewinnen, und brauchst dafür <b>${pc1(sp.need)}</b>.`;
  const ar = A(), r = applyDecision(ar, evs, chosen, K_DIFF.arena);
  lastDelta = r.delta;
  if (r.q !== 'eq') { ar.hist.push(Math.round(ar.rating)); ar.hist = ar.hist.slice(-200); }
  track('arena', h.pos, r.q, r.loss);
  const labels = opts.map(o => ACT[o]), bestTxt = `${labels[r.bi]} ist gegen den ${bot.short} am besten`;
  if (!r.correct) saveMistake({
    mode: 'arena', spot: 'arena:' + h.pos, pos: h.pos, me: h.me, board: [], seq: '', model: MODEL,
    face: h.pos === 'SB' ? `Heads-up gegen den ${bot.short}, ${b1(S)} BB effektiv. Du bist im Small Blind und handelst zuerst.` : `Heads-up gegen den ${bot.short}, ${b1(S)} BB effektiv. Der Bot geht aus dem Small Blind all-in.`,
    pot: h.pos === 'SB' ? 1.5 : S + 1, labels, ev: evs, best: r.bi, orig: chosen, mix: bestTxt, q: r.q,
  });
  let out;
  if (a === 'fold') {
    const v = h.pos === 'SB' ? -.5 : -1; h.log.push('Du foldest'); settle(v, v);
    out = `Du foldest und gibst ${h.pos === 'SB' ? '0,5' : '1'} BB ab. Der Bot hatte ${idLabel(cid(h.bot))}.`; renderTable(true, 0);
  } else if (h.pos === 'SB') {
    h.log.push(`Du gehst all-in mit ${b1(S)} BB`); h.betMe = S; h.stMe = state.match.me - S; h.lblMe = 'All-in';
    if (Math.random() < bot.call(S)[cid(h.bot)]) { h.log.push('Bot callt'); out = 'Der Bot callt. ' + showdown().txt; }
    else { h.log.push('Bot foldet'); settle(1, 1); renderTable(true, 0); out = `Der Bot foldet (mit ${idLabel(cid(h.bot))}). Du gewinnst seinen Big Blind, 1 BB.`; }
  } else { h.log.push('Du callst'); out = showdown().txt; }
  pushLog(ar, { pos: h.pos, S: b1(S), lab: idLabel(mi), act: ACT[a], q: r.q }); persist(); render();
  afterHand(decisionBlock({ index: 0, r, labels, ev: evs, chosen, extra: why }) + `<p>${out}</p>` +
    `<details><summary>Deine beste Strategie gegen diesen Bot: ${h.pos === 'SB' ? 'All-in aus dem Small Blind' : 'Call im Big Blind'} bei ${b1(S)} BB</summary><div style="margin-top:10px">${brChart(h.pos, S, bot, mi)}</div><p class="muted" style="margin-top:6px;font-size:.85rem">Grün: Mit diesen Händen ${h.pos === 'SB' ? 'gehst du am besten all-in' : 'callst du am besten'}. Deine Hand ist umrandet. Gegen einen anderen Bot-Stil sieht die Tabelle anders aus.</p></details>` +
    modelNote(MODEL));
}

export function mountArena() {
  $('ar-newmatch').onclick = newMatch;
  const note = () => { const b = bots()[$('ar-bot').value]; $('ar-botnote').textContent = `Der ${b.short} ${b.note} Gilt ab dem nächsten Match.`; };
  $('ar-bot').onchange = note;
  const mt = state.match;
  if (mt) { $('ar-start').value = String(mt.start); $('ar-bot').value = mt.style; }
  note(); render();
  if (mt) { mt.sbMe = !mt.sbMe; mt.n--; newHand(); } else newMatch();
}
