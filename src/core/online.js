// Online-Match heads-up zwischen zwei Menschen (Roadmap 02): Spielregeln, Bewertung jeder Entscheidung
// und glücksbereinigtes Elo. Rein, ohne Netz und DOM. Der Server (Edge Function) ist autoritativ und
// rechnet mit genau diesem Modul; der Browser bekommt nur die Sicht seines Platzes (viewFor).
import { classOfInts, cardStr, idLabel } from './cards.js';
import { eval7, handName } from './evaluator.js';
import { mcEq } from './equity.js';
import { judge, expected, START_RATING } from './rating.js';
import { evalSpot } from './pushfold.js';
import { fR } from './hutree.js';

/** Formate. kind bestimmt Regeln und Rating (Push/Fold teilt sich ein Rating über alle Startstacks). */
export const FORMATS = {
  pf10: { kind: 'pf', stack: 10, name: 'Push/Fold-Match, 10 BB' },
  pf15: { kind: 'pf', stack: 15, name: 'Push/Fold-Match, 15 BB' },
  pf20: { kind: 'pf', stack: 20, name: 'Push/Fold-Match, 20 BB' },
  duel: { kind: 'duel', stack: 100, name: 'Preflop-Duell, 100 BB' },
};
export const KINDS = { pf: 'Push/Fold', duel: 'Preflop-Duell' };
export const THINK_MS = 20000;      // Bedenkzeit je Entscheidung
export const BANK_MS = 30000;       // Zeitbank je Spieler und Match
export const PAUSE_MS = 2500;       // Pause zwischen zwei Händen (Ergebnis ansehen)
export const RECONNECT_MS = 60000;  // so lange darf eine Verbindung abreißen
export const GRACE_MS = 1500;       // Netzlaufzeit, die nach Ablauf noch angenommen wird
export const PF_MAX_HANDS = 40;     // danach entscheidet der Chipstand
export const DUEL_HANDS = 10;       // Hände je Duell-Match, Positionen abwechselnd
export const QSCALE = 40;           // Abstand der Spielqualität (BB/100), der etwa 91 : 9 ergibt
export const MIN_DECISIONS = 8;     // ab so vielen Entscheidungen je Spieler zählt ein Match voll
export const MIN_RANKED = 10;       // Matches, ab denen ein Online-Rating nicht mehr vorläufig ist

const PF_NODES = {
  pf_sb: { pos: 'SB', a: ['fold', 'push'] },
  pf_bb: { pos: 'BB', a: ['fold', 'call'] },
};
export const ACTION_NAME = { fold: 'Fold', push: 'All-in', call: 'Call', raise: 'Raise', '3bet': '3-Bet', '4bet': '4-Bet', jam: 'All-in' };
const DUEL_LABEL = {
  root: { fold: 'Fold', raise: 'Raise auf 2,5' },
  vsOpen: { fold: 'Fold', call: 'Call 1,5', '3bet': '3-Bet auf 10' },
  vs3b: { fold: 'Fold', call: 'Call 7,5', '4bet': '4-Bet auf 22' },
  vs4b: { fold: 'Fold', call: 'Call 12', jam: 'All-in (100)' },
  vsJam: { fold: 'Fold', call: 'Call 78' },
};
// eingesetzte Chips beider Spieler nach Erreichen eines Knotens [SB, BB]
const DUEL_BETS = { root: [.5, 1], vsOpen: [2.5, 1], vs3b: [2.5, 10], vs4b: [22, 10], vsJam: [100, 22] };
export const SPOT_NAME = {
  pf_sb: 'Small Blind: All-in oder Fold', pf_bb: 'Big Blind gegen All-in',
  root: 'Small Blind eröffnet', vsOpen: 'Big Blind gegen Raise', vs3b: 'Small Blind gegen 3-Bet', vs4b: 'Big Blind gegen 4-Bet', vsJam: 'Small Blind gegen All-in',
};

const r2 = x => Math.round(x * 100) / 100;
const other = seat => 1 - seat;

/**
 * Kontext mit den Solver-Tabellen. T aus makeTables, nash = makeBots(T).nash, HU aus makeHU.
 * equity(a, b) liefert die Gewinnchance von Hand a gegen b (Karten als Zahlen); Standard Monte Carlo.
 */
export const makeContext = ({ T, nash, HU, equity = (a, b) => mcEq(a, b, 20000) }) => ({ T, nash, HU, equity });

// ---------- Karten und Nachprüfbarkeit ----------

/** Gemischtes Deck als Zahlen 0..51. randInt(n) liefert gleichverteilt 0..n-1 (auf dem Server kryptografisch). */
export function shuffledDeck(randInt) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = randInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
/** Text, dessen SHA-256 vor der Hand veröffentlicht wird (Hash vorher, Deck und Salt nach dem Match). */
export const commitText = (deck, salt) => `${salt}:${deck.map(cardStr).join('')}`;
/** Aus welchen Deck-Positionen die Karten stammen: SB 0–1, BB 2–3, Board 4–8. */
export const dealFrom = deck => ({ sb: deck.slice(0, 2), bb: deck.slice(2, 4), board: deck.slice(4, 9) });

// ---------- Match anlegen ----------

/**
 * players: [{ id, name, rating, games }] mit Online-Rating und Zahl gewerteter Matches im Format-Typ.
 * firstSb: Platz, der in Hand 1 den Small Blind hat.
 */
export function createMatch({ id, format, players, now, firstSb = 0 }) {
  const F = FORMATS[format];
  if (!F) throw new Error('Unbekanntes Format');
  if (players.length !== 2 || players[0].id === players[1].id) throw new Error('Ein Match braucht zwei verschiedene Spieler');
  return {
    v: 1, id, format, kind: F.kind, start: F.stack, created: now,
    players: players.map(p => ({ id: p.id, name: p.name, rating: p.rating ?? START_RATING, games: p.games ?? 0 })),
    stacks: [F.stack, F.stack], net: [0, 0], luck: [0, 0], banks: [BANK_MS, BANK_MS],
    firstSb, handNo: 0, hand: null, hands: [], decisions: [],
    status: 'active', result: null, rematch: [false, false], next: null,
  };
}

/** true, wenn eine neue Hand ausgeteilt werden muss (der Server ruft dann startHand mit frischem Deck). */
export const needsHand = S => S.status === 'active' && (!S.hand || S.hand.done);

const nodeOf = (ctx, S, id) => S.kind === 'pf' ? PF_NODES[id] : { pos: ctx.HU.tree[id].p, a: ctx.HU.tree[id].a };
const posOf = (h, seat) => (seat === h.sb ? 'SB' : 'BB');
const seatAt = (h, pos) => (pos === 'SB' ? h.sb : other(h.sb));

/** Teilt die nächste Hand aus. deal: { deck, salt, commit } (commit = SHA-256 von commitText). */
export function startHand(ctx, S, { deck, salt, commit }, now) {
  if (!needsHand(S)) throw new Error('Die laufende Hand ist noch nicht beendet');
  if (!Array.isArray(deck) || deck.length !== 52 || new Set(deck).size !== 52) throw new Error('Ungültiges Deck');
  S.handNo++;
  const sb = S.handNo % 2 === 1 ? S.firstSb : other(S.firstSb), bb = other(sb), d = dealFrom(deck);
  const cards = []; cards[sb] = d.sb; cards[bb] = d.bb;
  (S.decks ??= {})[S.handNo] = { cards, board: d.board, deck: deck.slice(), salt };
  const h = S.hand = {
    no: S.handNo, sb, cards, board: d.board, commit, hist: [], log: [], done: false, turn: null, since: now + (S.handNo > 1 ? PAUSE_MS : 0),
  };
  if (S.kind === 'pf') {
    const eff = Math.min(S.stacks[0], S.stacks[1]);
    h.eff = eff; h.bets = []; h.bets[sb] = Math.min(.5, S.stacks[sb]); h.bets[bb] = Math.min(1, S.stacks[bb]);
    if (eff < 1.5) { h.log.push({ seat: null, a: 'auto' }); return showdown(ctx, S, now); }
    h.node = 'pf_sb';
  } else {
    h.bets = []; h.bets[sb] = .5; h.bets[bb] = 1; h.node = 'root';
  }
  setTurn(ctx, S, now);
  return null;
}

function setTurn(ctx, S, now) {
  const h = S.hand, seat = seatAt(h, nodeOf(ctx, S, h.node).pos), since = Math.max(now, h.since);
  h.turn = { seat, since, deadline: since + THINK_MS + S.banks[seat] };
}

/** Wer ist dran und mit welchen Optionen? null, wenn niemand handeln muss. */
export function legal(ctx, S) {
  const h = S.hand;
  if (S.status !== 'active' || !h || h.done || !h.turn) return null;
  return { seat: h.turn.seat, node: h.node, options: nodeOf(ctx, S, h.node).a };
}

// ---------- Entscheidungen bewerten ----------

/** EVs aller Optionen für seat am aktuellen Knoten, gegen das Gleichgewicht des Gegners. */
export function evsFor(ctx, S, seat) {
  const h = S.hand, pos = posOf(h, seat), mi = classOfInts(h.cards[seat][0], h.cards[seat][1]);
  if (S.kind === 'pf') {
    const sp = evalSpot(ctx.T, pos, h.eff, mi, ctx.nash);
    return PF_NODES[h.node].a.map(a => sp.ev[a]);
  }
  // Range des Gegners: Gleichgewichts-Anteile aller Aktionen, die er in dieser Hand gewählt hat
  const opp = new Array(169).fill(1);
  for (const x of h.hist) if (x.seat !== seat) for (let o = 0; o < 169; o++) opp[o] *= ctx.HU.strat[x.node][o][x.k];
  return ctx.HU.nodeEVs(h.node, pos, mi, opp);
}

function labelsFor(ctx, S, node) {
  return S.kind === 'pf' ? PF_NODES[node].a.map(a => ACTION_NAME[a]) : nodeOf(ctx, S, node).a.map(a => DUEL_LABEL[node][a]);
}

function record(ctx, S, seat, k, now, timeout) {
  const h = S.hand, ev = evsFor(ctx, S, seat), j = judge(ev, k);
  S.decisions.push({
    hand: h.no, seat, pos: posOf(h, seat), node: h.node, eff: S.kind === 'pf' ? h.eff : 100,
    cls: classOfInts(h.cards[seat][0], h.cards[seat][1]), cards: h.cards[seat].slice(),
    labels: labelsFor(ctx, S, h.node), ev: ev.map(r2x), chosen: k, best: j.bi, q: j.q, loss: r2x(j.loss),
    ms: Math.max(0, now - h.turn.since), timeout: !!timeout,
  });
}
const r2x = x => Math.round(x * 1000) / 1000;

// ---------- Aktionen ----------

/**
 * Spieler seat wählt action. Liefert { ok: true } oder { ok: false, error }.
 * Eine Aktion nach Ablauf der Bedenkzeit (plus Netzlaufzeit) zählt als Fold (dann changed: true).
 */
export function act(ctx, S, seat, action, now) {
  const L = legal(ctx, S);
  if (!L) return { ok: false, error: 'Gerade ist niemand am Zug.' };
  if (L.seat !== seat) return { ok: false, error: 'Du bist nicht am Zug.' };
  const k = L.options.indexOf(action);
  if (k < 0) return { ok: false, error: 'Diese Aktion ist hier nicht möglich.' };
  if (now > S.hand.turn.deadline + GRACE_MS) { timeoutFold(ctx, S, now); return { ok: false, changed: true, error: 'Die Bedenkzeit war abgelaufen, die Hand zählt als Fold.' }; }
  useTime(S, seat, now);
  record(ctx, S, seat, k, now, false);
  advance(ctx, S, seat, k, now);
  return { ok: true };
}

function useTime(S, seat, now) {
  const over = Math.max(0, now - S.hand.turn.since - THINK_MS);
  S.banks[seat] = Math.max(0, S.banks[seat] - over);
}

function timeoutFold(ctx, S, now) {
  const h = S.hand, seat = h.turn.seat, k = nodeOf(ctx, S, h.node).a.indexOf('fold');
  S.banks[seat] = 0;
  record(ctx, S, seat, k, now, true);
  advance(ctx, S, seat, k, now, true);
}

function advance(ctx, S, seat, k, now, timeout = false) {
  const h = S.hand, a = nodeOf(ctx, S, h.node).a[k];
  h.hist.push({ seat, node: h.node, k });
  h.log.push({ seat, a, timeout });
  h.turn = null;
  if (S.kind === 'pf') {
    if (a === 'fold') return endHand(S, h.node === 'pf_sb' ? -h.bets[h.sb] : h.bets[other(h.sb)], null, now);
    if (a === 'push') { h.bets[h.sb] = h.eff; h.node = 'pf_bb'; return setTurn(ctx, S, now); }
    h.bets[other(h.sb)] = h.eff;
    return showdown(ctx, S, now);
  }
  const tree = ctx.HU.tree, next = tree[h.node].c[k];
  h.node = next;
  if (!tree[next].t) { h.bets = []; h.bets[h.sb] = DUEL_BETS[next][0]; h.bets[other(h.sb)] = DUEL_BETS[next][1]; return setTurn(ctx, S, now); }
  const t = tree[next];
  if (t.t === 'fold') return endHand(S, t.sb, null, now);
  return showdown(ctx, S, now);
}

/** Karten aufdecken. Ergebnis nach Karten und glücksbereinigt (Equity statt Ergebnis), jeweils für den SB. */
function showdown(ctx, S, now) {
  const h = S.hand, sb = h.sb, bb = other(sb);
  const x = eval7([...h.cards[sb], ...h.board]), y = eval7([...h.cards[bb], ...h.board]);
  const eq = ctx.equity(h.cards[sb], h.cards[bb]);
  let real, luck;
  if (S.kind === 'pf') {
    real = x > y ? h.eff : x < y ? -h.eff : 0; luck = h.eff * (2 * eq - 1);
    h.bets[sb] = h.bets[bb] = h.eff;
  } else {
    const t = ctx.HU.tree[h.node], win = x > y ? 1 : x < y ? 0 : .5;
    real = t.pot * win - t.inv;
    luck = t.t === 'sd' ? t.pot * fR(eq, t.d) - t.inv : t.pot * eq - t.inv;
    h.bets[sb] = h.bets[bb] = t.pot / 2;
  }
  return endHand(S, real, { eq, luck, names: [handName(x), handName(y)] }, now);
}

/** Beendet die Hand. sbNet: Chips, die der SB gewinnt (negativ: verliert). sd: Daten zum Showdown. */
function endHand(S, sbNet, sd, now) {
  const h = S.hand, sb = h.sb, bb = other(sb);
  const luck = sd ? sd.luck : sbNet;
  S.net[sb] = r2(S.net[sb] + sbNet); S.net[bb] = r2(S.net[bb] - sbNet);
  S.luck[sb] = r2(S.luck[sb] + luck); S.luck[bb] = r2(S.luck[bb] - luck);
  if (S.kind === 'pf') { S.stacks[sb] = r2(S.stacks[sb] + sbNet); S.stacks[bb] = r2(S.stacks[bb] - sbNet); }
  h.done = true; h.turn = null;
  h.result = { sbNet: r2(sbNet), luck: r2(luck), showdown: !!sd, eq: sd ? r2x(sd.eq) : null, names: sd ? [sd.names[0], sd.names[1]] : null };
  S.hands.push(publicHand(h, true));
  if (S.kind === 'pf' && (S.stacks[0] <= .001 || S.stacks[1] <= .001)) return finish(S, 'bust', null, now);
  if (S.kind === 'pf' && S.handNo >= PF_MAX_HANDS) return finish(S, 'limit', null, now);
  if (S.kind === 'duel' && S.handNo >= DUEL_HANDS) return finish(S, 'hands', null, now);
  return null;
}

/** Öffentliche Zusammenfassung einer Hand. Karten nur nach einem Showdown (oder nach dem Match). */
function publicHand(h, withCards) {
  const show = withCards && h.result?.showdown;
  return {
    no: h.no, sb: h.sb, log: h.log.map(x => ({ ...x })), result: h.result,
    cards: show ? h.cards.map(c => c.slice()) : null, board: show ? h.board.slice() : null, commit: h.commit,
  };
}

// ---------- Zeit und Verbindung ----------

/**
 * Prüft abgelaufene Bedenkzeit und abgerissene Verbindungen. lastSeen: [ms, ms] letzter Lebenszeichen.
 * Liefert 'abandoned' (beide weg), 'forfeit', 'timeout' oder null.
 */
export function checkTimeouts(ctx, S, now, lastSeen) {
  if (S.status !== 'active') return null;
  const gone = lastSeen.map(t => now - t > RECONNECT_MS);
  if (gone[0] && gone[1]) { finish(S, 'abandoned', null, now); return 'abandoned'; }
  const g = gone.indexOf(true);
  if (g >= 0) { finish(S, 'forfeit', g, now); return 'forfeit'; }
  const h = S.hand;
  if (h && !h.done && h.turn && now >= h.turn.deadline) { timeoutFold(ctx, S, now); return 'timeout'; }
  return null;
}

/** Aufgeben: zählt wie ein verlorenes Match. */
export function resign(S, seat, now) {
  if (S.status !== 'active') return { ok: false, error: 'Das Match ist schon beendet.' };
  finish(S, 'resign', seat, now);
  return { ok: true };
}

/** Revanche anbieten. true, wenn jetzt beide wollen (dann legt der Server ein neues Match an). */
export function offerRematch(S, seat) {
  if (S.status !== 'finished' || S.next) return false;
  S.rematch[seat] = true;
  return S.rematch[0] && S.rematch[1];
}

// ---------- Glücksbereinigtes Elo ----------

/** Spielqualität: durchschnittlicher EV-Verlust in BB pro 100 Entscheidungen (kleiner ist besser). */
export function quality(decisions, seat) {
  const own = decisions.filter(d => d.seat === seat);
  if (!own.length) return { q: null, n: 0 };
  return { q: r2(100 * own.reduce((s, d) => s + d.loss, 0) / own.length), n: own.length };
}

/**
 * Wertung des Matches für Platz 0 (0 … 1) aus der Spielqualität beider Spieler, nicht aus den Chips.
 * Bei wenigen Entscheidungen rückt sie zur Mitte. null: Match zählt nicht (niemand hat entschieden).
 */
export function matchScore(qa, qb, na, nb) {
  if (qa === null || qb === null || !na || !nb) return null;
  const raw = 1 / (1 + Math.pow(10, -(qb - qa) / QSCALE));
  return 0.5 + (raw - 0.5) * Math.min(1, Math.min(na, nb) / MIN_DECISIONS);
}

/** Elo-Änderung beider Spieler. score: Wertung für Platz 0. K 40 in den ersten Matches, danach 20. */
export function eloChange(players, score) {
  if (score === null) return [0, 0];
  const e0 = expected(players[0].rating, players[1].rating);
  const K = p => (p.games < MIN_RANKED ? 40 : 20);
  return [Math.round(K(players[0]) * (score - e0)), Math.round(K(players[1]) * ((1 - score) - (1 - e0)))];
}

function finish(S, reason, loser, now) {
  if (S.status !== 'active') return reason;
  const h = S.hand;
  if (h && !h.done) { h.done = true; h.turn = null; h.result = null; S.hands.push(publicHand(h, false)); }
  const qs = [quality(S.decisions, 0), quality(S.decisions, 1)];
  let score = matchScore(qs[0].q, qs[1].q, qs[0].n, qs[1].n);
  if (reason === 'forfeit' || reason === 'resign') score = loser === 0 ? 0 : 1;
  if (reason === 'abandoned') score = null;
  const delta = eloChange(S.players, score);
  const chipsLead = S.net[0] > S.net[1] ? 0 : S.net[1] > S.net[0] ? 1 : null;
  S.status = 'finished'; S.ended = now;
  S.result = {
    reason, loser, score: score === null ? null : r2x(score), delta,
    ratings: S.players.map((p, i) => Math.max(100, p.rating + delta[i])),
    quality: qs.map(x => x.q), n: qs.map(x => x.n), net: S.net.slice(), luck: S.luck.slice(),
    chipsLead, better: score === null ? null : score > .5 ? 0 : score < .5 ? 1 : null,
  };
  return reason;
}

/** Alles, was nach dem Match veröffentlicht wird: Analyse beider Spieler, alle Karten, Decks mit Salt. */
export function matchRecord(S) {
  if (S.status !== 'finished') throw new Error('Das Match läuft noch');
  return {
    id: S.id, format: S.format, kind: S.kind, start: S.start, created: S.created, ended: S.ended,
    players: S.players.map(p => ({ name: p.name, rating: p.rating, games: p.games })),
    result: S.result, firstSb: S.firstSb,
    hands: S.hands.map(x => ({ ...x, ...cardsOf(S, x.no) })),
    decisions: S.decisions.map(d => ({ ...d, label: idLabel(d.cls) })),
  };
}
function cardsOf(S, no) {
  const x = S.decks?.[no];
  return x ? { cards: x.cards, board: x.board, deck: x.deck, salt: x.salt } : {};
}

// ---------- Sicht eines Platzes ----------

/**
 * Was der Browser von seat sehen darf: eigene Karten, öffentliche Aktionen, Karten des Gegners nur nach
 * einem Showdown. Deck, Salt und die Bewertung der Entscheidungen bleiben bis zum Matchende auf dem Server.
 */
export function viewFor(ctx, S, seat, now) {
  const opp = other(seat), h = S.hand, L = legal(ctx, S);
  const me = S.players[seat], op = S.players[opp];
  const v = {
    id: S.id, format: S.format, kind: S.kind, status: S.status, seat, now,
    me: { name: me.name, rating: me.rating, games: me.games }, opp: { name: op.name, rating: op.rating, games: op.games },
    start: S.start, handNo: S.handNo, totalHands: S.kind === 'pf' ? PF_MAX_HANDS : DUEL_HANDS,
    stacks: [S.stacks[seat], S.stacks[opp]], net: [S.net[seat], S.net[opp]], banks: [S.banks[seat], S.banks[opp]],
    hands: S.hands.slice(-12).map(x => flip(x, seat)),
    hand: null, rematch: [S.rematch[seat], S.rematch[opp]], next: S.next,
  };
  if (h && !h.done) {
    v.hand = {
      no: h.no, pos: posOf(h, seat), cards: h.cards[seat].slice(), commit: h.commit, node: h.node,
      bets: [h.bets[seat], h.bets[opp]], eff: S.kind === 'pf' ? h.eff : 100,
      log: h.log.map(x => ({ who: x.seat === seat ? 'me' : x.seat === null ? null : 'opp', a: x.a, timeout: !!x.timeout })),
      turn: h.turn ? { who: h.turn.seat === seat ? 'me' : 'opp', since: h.turn.since, deadline: h.turn.deadline } : null,
      options: L && L.seat === seat ? L.options.map((a, i) => ({ a, label: labelsFor(ctx, S, h.node)[i] })) : [],
    };
  }
  if (S.status === 'finished') v.record = matchRecord(S);
  return v;
}

/** Hand-Zusammenfassung aus Sicht von seat: Einträge [ich, Gegner], Ergebnis aus meiner Sicht. */
function flip(x, seat) {
  const sign = x.sb === seat ? 1 : -1;
  return {
    no: x.no, pos: x.sb === seat ? 'SB' : 'BB', commit: x.commit,
    log: x.log.map(l => ({ who: l.seat === seat ? 'me' : l.seat === null ? null : 'opp', a: l.a, timeout: !!l.timeout })),
    result: x.result ? { net: r2(sign * x.result.sbNet), luck: r2(sign * x.result.luck), showdown: x.result.showdown, eq: x.result.eq === null ? null : r2x(sign > 0 ? x.result.eq : 1 - x.result.eq), names: x.result.names && (sign > 0 ? x.result.names : [x.result.names[1], x.result.names[0]]) } : null,
    cards: x.cards ? [x.cards[seat], x.cards[other(seat)]] : null, board: x.board,
  };
}

// ---------- Profil und Fair Play ----------

/** Öffentliche Online-Werte eines Format-Typs im Profil nach einem Match (score: Wertung dieses Spielers). */
export function updateOnlineStats(prev, { rating, score }) {
  const p = { rating: START_RATING, games: 0, w: 0, d: 0, l: 0, ...(prev || {}) };
  if (score === null) return p;
  return { rating, games: p.games + 1, w: p.w + (score > .5 ? 1 : 0), d: p.d + (score === .5 ? 1 : 0), l: p.l + (score < .5 ? 1 : 0) };
}
/** Kennzahlen der letzten 20 Matches für die Fair-Play-Prüfung (nicht öffentlich). */
export const pushRecent = (recent, entry) => [...(recent || []), entry].slice(-20);

/** Variationskoeffizient der Bedenkzeiten (Streuung relativ zum Mittel). Menschen streuen stark. */
export function thinkCv(ms) {
  if (ms.length < 2) return null;
  const m = ms.reduce((a, b) => a + b, 0) / ms.length;
  if (!m) return 0;
  const sd = Math.sqrt(ms.reduce((a, b) => a + (b - m) ** 2, 0) / (ms.length - 1));
  return r2(sd / m);
}

/**
 * Hinweis auf Solver-Hilfe aus den letzten Matches: über viele Entscheidungen fast fehlerfrei
 * und dabei auffällig gleichmäßige Bedenkzeiten. Liefert einen Grund oder null. Markiert nur, sperrt nicht.
 */
export function fairPlayFlag(recent) {
  const rs = recent.filter(r => r.q !== null && r.n > 0);
  const n = rs.reduce((a, r) => a + r.n, 0);
  if (rs.length < 10 || n < 100) return null;
  const q = rs.reduce((a, r) => a + r.q * r.n, 0) / n;
  const cvs = rs.map(r => r.cv).filter(c => c !== null && c !== undefined);
  const cv = cvs.length ? cvs.reduce((a, b) => a + b, 0) / cvs.length : null;
  if (q < 1.5 && cv !== null && cv < .35) return `Spielqualität ${q.toFixed(1)} BB/100 über ${n} Entscheidungen bei gleichmäßiger Bedenkzeit (Streuung ${cv.toFixed(2)})`;
  if (q < .5 && n >= 300) return `Spielqualität ${q.toFixed(1)} BB/100 über ${n} Entscheidungen`;
  return null;
}

// ---------- Nachprüfen ----------

/**
 * Prüft nach dem Match jede Hand: Hash von Salt und Deck gleich dem vorher veröffentlichten Commit,
 * und die ausgeteilten Karten stammen aus diesem Deck. sha256(text) liefert den Hex-Hash (auch asynchron).
 * Ergebnis: Liste der Hand-Nummern mit Abweichung (leer = alles in Ordnung).
 */
export async function verifyRecord(record, sha256) {
  const bad = [];
  for (const h of record.hands) {
    if (!h.deck) { bad.push(h.no); continue; }
    const d = dealFrom(h.deck), same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const ok = (await sha256(commitText(h.deck, h.salt))) === h.commit
      && same(h.cards[h.sb], d.sb) && same(h.cards[other(h.sb)], d.bb) && same(h.board, d.board);
    if (!ok) bad.push(h.no);
  }
  return bad;
}
