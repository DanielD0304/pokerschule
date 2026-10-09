// Online-Match: Regeln, Sicht der Browser, glücksbereinigtes Elo, Zeit und Verbindungsabbruch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { makeTables } from '../src/core/preflop.js';
import { makeBots } from '../src/core/pushfold.js';
import { makeHU } from '../src/core/hutree.js';
import { cardFromStr, classOfInts } from '../src/core/cards.js';
import * as O from '../src/core/online.js';
import { stale } from '../scripts/sync-functions.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../public/data/' + f, import.meta.url), 'utf8'));
const T = makeTables(read('pf-data.json'));
const HU = makeHU(T, { tree: read('hu-tree.json'), strat: read('hu-strat.json') });
// deterministische Equity über die Klassen-Tabelle, damit die Tests nicht vom Zufall abhängen
const ctx = O.makeContext({ T, nash: makeBots(T).nash, HU, equity: (a, b) => T.EQ[classOfInts(a[0], a[1])][classOfInts(b[0], b[1])] });

const A = { id: 'a', name: 'Anna', rating: 1000, games: 0 }, B = { id: 'b', name: 'Bea', rating: 1000, games: 0 };
/** Deck, das mit den angegebenen Karten beginnt (SB 0–1, BB 2–3, Board 4–8), der Rest in fester Reihenfolge. */
function rigged(str) {
  const top = str.split(/\s+/).map(cardFromStr), rest = [];
  for (let k = 0; k < 52; k++) if (!top.includes(k)) rest.push(k);
  return [...top, ...rest];
}
const deal = (S, str, now) => O.startHand(ctx, S, { deck: rigged(str), salt: 'salz' + S.handNo, commit: 'h' + S.handNo }, now);
const newMatch = (format = 'pf10', now = 0) => O.createMatch({ id: 'm1', format, players: [A, B], now, firstSb: 0 });

test('Deck, Commit und Austeilen', () => {
  let x = 7;
  const d = O.shuffledDeck(n => (x = (x * 1103515245 + 12345) % 2147483648) % n);
  assert.equal(new Set(d).size, 52);
  assert.equal(O.commitText([0, 51], 'ab'), 'ab:2sAc');
  const f = O.dealFrom(rigged('As Ah 7d 2c 7s 7h 2d Kc Qc'));
  assert.deepEqual(f.sb, [cardFromStr('As'), cardFromStr('Ah')]);
  assert.deepEqual(f.board.length, 5);
  assert.throws(() => O.createMatch({ id: 'x', format: 'zz', players: [A, B], now: 0 }), /Format/);
  assert.throws(() => O.createMatch({ id: 'x', format: 'pf10', players: [A, A], now: 0 }), /zwei verschiedene/);
  const S = newMatch();
  assert.throws(() => O.startHand(ctx, S, { deck: [1, 2, 3], salt: '', commit: '' }, 0), /Deck/);
});

test('Browser sieht die Karten des Gegners vor dem Showdown nicht', () => {
  const S = newMatch();
  deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 1000);
  for (const seat of [0, 1]) {
    const v = O.viewFor(ctx, S, seat, 1000), json = JSON.stringify(v);
    assert.deepEqual(v.hand.cards, S.hand.cards[seat]);
    assert.equal(v.hand.oppCards, undefined);
    assert.ok(!/deck|salt|board|decisions/.test(json), 'weder Deck noch Salt, Board oder Bewertungen in der Sicht');
    assert.ok(!json.includes(JSON.stringify(S.hand.cards[1 - seat])), 'Karten des Gegners kommen nicht vor');
    assert.equal(v.record, undefined);
  }
  assert.deepEqual(O.viewFor(ctx, S, 0, 1000).hand.options.map(o => o.a), ['fold', 'push']);
  assert.deepEqual(O.viewFor(ctx, S, 1, 1000).hand.options, []);
});

test('Push/Fold: Aktionen prüfen, Showdown, Rating folgt der Spielqualität statt den Chips', () => {
  const S = newMatch();
  deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 0);
  assert.equal(O.act(ctx, S, 1, 'push', 10).ok, false, 'BB ist noch nicht dran');
  assert.match(O.act(ctx, S, 0, 'call', 10).error, /nicht möglich/);
  assert.ok(O.act(ctx, S, 0, 'push', 2000).ok);
  const v1 = O.viewFor(ctx, S, 1, 2000);
  assert.deepEqual(v1.hand.options.map(o => o.label), ['Fold', 'Call']);
  assert.deepEqual(v1.hand.log, [{ who: 'opp', a: 'push', timeout: false }]);
  assert.ok(O.act(ctx, S, 1, 'call', 5000).ok);
  // 72o callt gegen AA und trifft ein Full House: Bea gewinnt alle Chips, hat aber schlechter entschieden
  assert.equal(S.status, 'finished');
  const r = S.result;
  assert.equal(r.reason, 'bust');
  assert.deepEqual(r.net, [-10, 10]);
  assert.equal(r.chipsLead, 1);
  assert.equal(r.better, 0);
  assert.ok(r.quality[0] < r.quality[1]);
  assert.ok(r.delta[0] > 0 && r.delta[1] < 0, 'Anna gewinnt Rating, obwohl sie die Chips verliert');
  assert.ok(r.luck[0] > 0, 'glücksbereinigt liegt Anna vorne');
  const d = S.decisions;
  assert.equal(d.length, 2);
  assert.equal(d[0].q, 'best'); assert.equal(d[1].q, 'blun');
  assert.equal(d[1].ms, 3000);
  // nach dem Match ist alles öffentlich: Karten, Decks mit Salt, Bewertung beider Spieler
  const v = O.viewFor(ctx, S, 1, 6000);
  assert.equal(v.status, 'finished');
  assert.equal(v.record.hands[0].salt, 'salz0');
  assert.equal(v.record.decisions[1].label, '72o');
  assert.deepEqual(v.hands[0].cards[1], S.decks[1].cards[0], 'aus Beas Sicht sind Annas Karten die des Gegners');
  assert.equal(v.hands[0].result.net, 10);
  assert.throws(() => O.matchRecord(newMatch()), /läuft/);
});

test('Push/Fold: Fold, Positionswechsel, Pause und Auto-All-in', () => {
  const S = newMatch('pf15');
  deal(S, '7c 2d Kd Kh 3s 4s 5s 9h Tc', 0);
  O.act(ctx, S, 0, 'fold', 100);
  assert.deepEqual(S.stacks, [14.5, 15.5]);
  assert.ok(O.needsHand(S));
  assert.equal(S.decisions[0].q, 'best', '72o foldet im SB bei 15 BB');
  deal(S, '7c 2d Kd Kh 3s 4s 5s 9h Tc', 1000);
  assert.equal(S.hand.sb, 1, 'Positionen wechseln');
  assert.equal(S.hand.turn.since, 1000 + O.PAUSE_MS);
  assert.equal(S.hand.turn.deadline, 1000 + O.PAUSE_MS + O.THINK_MS + O.BANK_MS);
  O.act(ctx, S, 1, 'push', 4000);
  O.act(ctx, S, 0, 'fold', 4500);
  assert.deepEqual(S.stacks, [13.5, 16.5]);
  // sehr kleiner Stack: automatisch all-in, keine Entscheidung
  S.stacks = [1.2, 28.8];
  deal(S, 'As Ah 7d 2c 3s 8h 9d Kc Qc', 5000);
  assert.equal(S.hand.done, true);
  assert.equal(S.decisions.length, 3, 'Auto-All-in ist keine Entscheidung');
  assert.equal(S.stacks[0], 2.4);
  assert.equal(S.hands.at(-1).log[0].a, 'auto');
});

test('Push/Fold: Handlimit beendet das Match nach Chips', () => {
  const S = newMatch();
  for (let i = 0; i < O.PF_MAX_HANDS; i++) {
    deal(S, '7c 2d Kd Kh 3s 4s 5s 9h Tc', i * 10000);
    O.act(ctx, S, S.hand.turn.seat, 'fold', i * 10000 + 3000);
  }
  assert.equal(S.status, 'finished');
  assert.equal(S.result.reason, 'limit');
  assert.equal(S.result.chipsLead, null);
});

test('Bedenkzeit: Zeitbank, Fold bei Ablauf, verspätete Aktion', () => {
  const S = newMatch();
  deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 0);
  assert.equal(O.checkTimeouts(ctx, S, 5000, [5000, 5000]), null);
  O.act(ctx, S, 0, 'push', O.THINK_MS + 4000);
  assert.equal(S.banks[0], O.BANK_MS - 4000, 'Überziehen kostet Zeitbank');
  const dl = S.hand.turn.deadline;
  assert.equal(O.checkTimeouts(ctx, S, dl - 1, [dl, dl]), null);
  assert.equal(O.checkTimeouts(ctx, S, dl, [dl, dl]), 'timeout');
  const last = S.decisions.at(-1);
  assert.equal(last.timeout, true); assert.equal(last.seat, 1);
  assert.equal(S.banks[1], 0);
  assert.deepEqual(S.stacks, [11, 9]);
  // verspätete Aktion zählt als Fold
  deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', dl);
  const t = S.hand.turn;
  const res = O.act(ctx, S, t.seat, 'push', t.deadline + O.GRACE_MS + 1);
  assert.equal(res.ok, false); assert.equal(res.changed, true); assert.match(res.error, /Bedenkzeit/);
  assert.equal(S.decisions.at(-1).timeout, true);
  assert.equal(O.act(ctx, S, 0, 'push', 0).ok, false, 'niemand am Zug');
});

test('Verbindungsabbruch, Aufgeben, Revanche', () => {
  let S = newMatch();
  deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 0);
  assert.equal(O.checkTimeouts(ctx, S, 70000, [70000, 5000]), 'forfeit');
  assert.equal(S.result.loser, 1); assert.equal(S.result.score, 1);
  assert.ok(S.result.delta[0] > 0 && S.result.delta[1] < 0);
  assert.equal(S.hands.length, 1, 'die offene Hand wird ohne Ergebnis abgelegt');
  assert.equal(O.checkTimeouts(ctx, S, 90000, [0, 0]), null, 'beendete Matches bleiben beendet');

  S = newMatch(); deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 0);
  assert.equal(O.checkTimeouts(ctx, S, 70000, [0, 0]), 'abandoned');
  assert.equal(S.result.score, null); assert.deepEqual(S.result.delta, [0, 0]);

  S = newMatch(); deal(S, 'As Ah 7d 2c 7s 7h 2d Kc Qc', 0);
  assert.equal(O.offerRematch(S, 0), false, 'erst nach dem Match');
  assert.ok(O.resign(S, 0, 100).ok);
  assert.equal(O.resign(S, 0, 100).ok, false);
  assert.equal(S.result.score, 0);
  assert.equal(O.offerRematch(S, 0), false);
  assert.deepEqual(O.viewFor(ctx, S, 1, 200).rematch, [false, true]);
  assert.equal(O.offerRematch(S, 1), true);
});

test('Preflop-Duell: Baum, Range des Gegners, zehn Hände', () => {
  const S = newMatch('duel');
  deal(S, 'As Ks Qd Jd 2c 3c 4h 8s 9s', 0);
  assert.deepEqual(O.viewFor(ctx, S, 0, 0).hand.options.map(o => o.label), ['Fold', 'Raise auf 2,5']);
  O.act(ctx, S, 0, 'raise', 1000);
  const evOpen = O.evsFor(ctx, S, 1);
  assert.equal(evOpen.length, 3);
  O.act(ctx, S, 1, '3bet', 2000);
  assert.deepEqual(O.viewFor(ctx, S, 0, 2000).hand.bets, [2.5, 10]);
  O.act(ctx, S, 0, 'call', 3000);
  // 3-Bet-Pot, Showdown nach fünf Karten: AK ohne Treffer gegen QJ ohne Treffer → AK gewinnt 10
  assert.ok(S.hand.done);
  assert.deepEqual(S.net, [10, -10]);
  assert.equal(S.decisions.length, 3);
  assert.ok(S.decisions.every(d => d.labels.length === d.ev.length));
  // die übrigen Hände: der SB foldet
  while (S.status === 'active') { deal(S, 'As Ks Qd Jd 2c 3c 4h 8s 9s', S.handNo * 10000); O.act(ctx, S, S.hand.turn.seat, 'fold', S.handNo * 10000 + 3000); }
  assert.equal(S.handNo, O.DUEL_HANDS);
  assert.equal(S.result.reason, 'hands');
  assert.equal(S.hands.length, O.DUEL_HANDS);
});

test('Wertung und Elo', () => {
  assert.equal(O.matchScore(null, 5, 0, 3), null);
  assert.equal(O.matchScore(10, 10, 20, 20), .5);
  assert.ok(Math.abs(O.matchScore(0, O.QSCALE, 20, 20) - 1 / 1.1) < 1e-12);
  assert.ok(O.matchScore(0, O.QSCALE, 2, 20) < O.matchScore(0, O.QSCALE, 20, 20), 'wenige Entscheidungen zählen weniger');
  assert.deepEqual(O.eloChange([A, B], null), [0, 0]);
  assert.deepEqual(O.eloChange([A, B], .5), [0, 0]);
  assert.deepEqual(O.eloChange([A, B], 1), [20, -20]);
  assert.deepEqual(O.eloChange([{ rating: 1000, games: 50 }, B], 1), [10, -20], 'K sinkt nach den ersten Matches');
  assert.deepEqual(O.quality([], 0), { q: null, n: 0 });
  assert.deepEqual(O.quality([{ seat: 0, loss: .5 }, { seat: 0, loss: 0 }, { seat: 1, loss: 2 }], 0), { q: 25, n: 2 });
});

test('Profilwerte und Fair Play', () => {
  const p = O.updateOnlineStats(undefined, { rating: 1012, score: .7 });
  assert.deepEqual(p, { rating: 1012, games: 1, w: 1, d: 0, l: 0 });
  assert.equal(O.updateOnlineStats(p, { rating: 1, score: null }).rating, 1012, 'ungewertete Matches ändern nichts');
  assert.equal(O.updateOnlineStats(p, { rating: 1000, score: .5 }).d, 1);
  assert.equal(O.updateOnlineStats(p, { rating: 990, score: .2 }).l, 1);
  let rec = [];
  for (let i = 0; i < 25; i++) rec = O.pushRecent(rec, { q: i, n: 1, cv: 1 });
  assert.equal(rec.length, 20); assert.equal(rec[0].q, 5);
  assert.equal(O.thinkCv([1000]), null);
  assert.equal(O.thinkCv([0, 0]), 0);
  assert.equal(O.thinkCv([1000, 3000]), .71);
  const human = Array.from({ length: 12 }, () => ({ q: 1, n: 12, cv: .9 }));
  const bot = Array.from({ length: 12 }, () => ({ q: 1, n: 12, cv: .1 }));
  assert.equal(O.fairPlayFlag(human), null);
  assert.match(O.fairPlayFlag(bot), /gleichmäßiger Bedenkzeit/);
  assert.equal(O.fairPlayFlag(bot.slice(0, 5)), null, 'zu wenige Matches');
  assert.match(O.fairPlayFlag(Array.from({ length: 25 }, () => ({ q: .2, n: 15, cv: .9 }))), /BB\/100/);
});

const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function seeded(seed) { return n => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 2147483648 * n); }; }

test('Simulation: Zustand übersteht JSON zwischen den Anfragen, Chips bleiben erhalten, Decks prüfbar', async () => {
  for (const format of ['pf10', 'pf20', 'duel']) {
    for (let m = 0; m < 6; m++) {
      const rnd = seeded(1000 * m + format.length);
      let S = O.createMatch({ id: 'sim', format, players: [A, B], now: 0, firstSb: m % 2 });
      let now = 0;
      const store = () => { S = JSON.parse(JSON.stringify(S)); };
      while (S.status === 'active') {
        if (O.needsHand(S)) {
          const deck = O.shuffledDeck(rnd), salt = 's' + S.handNo;
          O.startHand(ctx, S, { deck, salt, commit: sha(O.commitText(deck, salt)) }, now);
          store(); continue;
        }
        const L = O.legal(ctx, S);
        now = Math.max(now, S.hand.turn.since) + 500 + rnd(5000);
        for (const seat of [0, 1]) {
          const v = O.viewFor(ctx, S, seat, now);
          if (S.hand && !S.hand.done) assert.ok(!JSON.stringify(v).includes('"' + O.commitText(S.decks[S.handNo].deck, 's').slice(2, 12)), 'kein Deck in der Sicht');
        }
        if (rnd(30) === 0) { assert.equal(O.checkTimeouts(ctx, S, S.hand.turn.deadline, [now, now]), 'timeout'); store(); continue; }
        assert.ok(O.act(ctx, S, L.seat, L.options[rnd(L.options.length)], now).ok);
        store();
      }
      if (S.kind === 'pf') assert.equal(Math.round((S.stacks[0] + S.stacks[1]) * 100), 2 * S.start * 100, 'Chips bleiben erhalten');
      assert.equal(Math.round((S.net[0] + S.net[1]) * 100), 0);
      assert.ok(['bust', 'limit', 'hands'].includes(S.result.reason));
      const rec = O.matchRecord(S);
      assert.deepEqual(await O.verifyRecord(rec, sha), []);
      assert.equal(rec.decisions.length, S.decisions.length);
      assert.ok(rec.decisions.every(d => d.ev.every(Number.isFinite)));
    }
  }
});

test('Nachprüfen erkennt ein ausgetauschtes Deck', async () => {
  const S = newMatch();
  const deck = rigged('As Ah 7d 2c 7s 7h 2d Kc Qc');
  O.startHand(ctx, S, { deck, salt: 'x', commit: sha(O.commitText(deck, 'x')) }, 0);
  O.resign(S, 0, 1);
  const rec = O.matchRecord(S);
  assert.deepEqual(await O.verifyRecord(rec, sha), []);
  rec.hands[0].deck = [...deck.slice(1), deck[0]];
  assert.deepEqual(await O.verifyRecord(rec, sha), [1]);
  delete rec.hands[0].deck;
  assert.deepEqual(await O.verifyRecord(rec, sha), [1]);
});

test('Kopie der Kernlogik für die Edge Function ist aktuell (npm run functions:sync)', () => {
  assert.deepEqual(stale(), []);
});
