// Online-Spiel gegen Menschen: Lobby, Warteschlange, Einladung per Link, Live-Tisch und Analyse nach dem Match.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as N from '../../modes/online.js';
import { enabled as accountsOn } from '../../modes/account.js';
import { useAccount } from './Account.jsx';
import { FORMATS, KINDS, ACTION_NAME, SPOT_NAME, THINK_MS, MIN_RANKED, verifyRecord } from '../../core/online.js';
import { icard, idLabel } from '../../core/cards.js';
import { QUAL } from '../../core/rating.js';
import { nf, sg } from '../../modes/dom.js';
import { Card } from '../ui.jsx';

const useOnline = () => useSyncExternalStore(N.subscribe, N.getOnline);
/** Rendert regelmäßig neu (für Uhren). */
function useNow(ms = 250) {
  const [, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT(t => t + 1), ms); return () => clearInterval(id); }, [ms]);
  return N.serverNow();
}
const b1 = x => nf(Math.round(x * 10) / 10, Math.abs(x % 1) < .05 ? 0 : 1);
const Badge = ({ q }) => <span className="badge" style={{ '--c': `var(${QUAL[q][1]})` }}>{QUAL[q][0]}</span>;
const Backs = () => <><div className="card back" role="img" aria-label="verdeckte Karte" /><div className="card back" role="img" aria-label="verdeckte Karte" /></>;
const Cards = ({ list, small }) => list.map(n => { const c = icard(n); return <Card key={n} r={c.r} s={c.s} small={small} />; });
const actText = (l, me, opp) => l.a === 'auto' ? 'Beide automatisch all-in' : `${l.who === 'me' ? me : opp}: ${ACTION_NAME[l.a]}${l.timeout ? ' (Zeit abgelaufen)' : ''}`;
const ratingText = o => o ? `${o.rating}${o.games < MIN_RANKED ? ' (vorläufig)' : ''}` : '1000 (vorläufig)';

function Head({ children }) {
  return (
    <div className="page-head">
      <Link to="/spielen" className="eyebrow">← Spielen</Link>
      <h1>Online gegen Menschen</h1>
      <p>Heads-up gegen andere Lernende, ohne Echtgeld. Dein Rating misst, wie gut du entscheidest, nicht wer die Karten gewinnt.</p>
      {children}
    </div>
  );
}

export default function Online() {
  const acc = useAccount(), on = useOnline();
  const [params, setParams] = useSearchParams();
  const code = params.get('einladung');
  useEffect(() => { if (acc.user) N.startOnline(); }, [acc.user]);

  if (!accountsOn) return <><Head /><div className="notice">Das Online-Spiel braucht Konten, und die sind auf dieser Installation nicht eingerichtet. Gegen Bots spielst du in der <Link to="/spielen/arena">Arena</Link>.</div></>;
  if (!acc.user) return <><Head /><div className="notice">Für das Online-Spiel brauchst du ein kostenloses Konto, damit dein Gegner weiß, gegen wen er spielt, und dein Rating gespeichert wird. <Link to="/konto">Anmelden oder Konto anlegen</Link></div></>;
  if (!acc.profile) return <><Head /><div className="loading" role="status">Lade Konto …</div></>;
  if (!acc.profile.display_name) return <><Head /><div className="notice">Lege zuerst unter <Link to="/konto">Konto</Link> einen Anzeigenamen fest. Er wird deinem Gegner angezeigt.</div></>;

  const v = on.view;
  if (on.phase === 'match' && v) return v.status === 'active' ? <><Head /><Table v={v} on={on} /></> : <><Head /><Finished v={v} on={on} /></>;
  return (<>
    <Head />
    {on.error && <div className="notice" role="alert">{on.error}</div>}
    {code && on.phase === 'idle' && <Invitation code={code} onDone={() => setParams({})} />}
    {on.phase === 'queue' && <Waiting on={on} />}
    {on.phase === 'invite' && <InviteLink on={on} />}
    {on.phase === 'idle' && <Lobby profile={acc.profile} busy={on.busy} />}
    <History />
    <Explainer />
  </>);
}

// ---------- Lobby ----------
function Lobby({ profile, busy }) {
  const [format, setFormat] = useState(() => { try { return localStorage.getItem('pokerschule.online.format') || 'pf15'; } catch { return 'pf15'; } });
  const pick = f => { setFormat(f); try { localStorage.setItem('pokerschule.online.format', f); } catch { /* egal */ } };
  const o = profile.online || {};
  return (
    <div className="grid2">
      <section className="box">
        <h3>Neues Match</h3>
        <label className="field">Format
          <select value={format} onChange={e => pick(e.target.value)}>
            {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
          </select>
          <span className="hint">{FORMATS[format].kind === 'pf' ? 'Gleiche Stacks, nur All-in oder Fold, bis einer pleite ist (höchstens 40 Hände).' : 'Zehn Hände mit je 100 BB: Raise, 3-Bet, 4-Bet oder Fold. Die Positionen wechseln ab.'}</span>
        </label>
        <p className="muted">Bedenkzeit: 20 Sekunden je Entscheidung plus 30 Sekunden Zeitbank je Match. Läuft sie ab, zählt die Hand als Fold.</p>
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" disabled={busy} onClick={() => N.findOpponent(format)}>Gegner suchen</button>
          <button className="btn" disabled={busy} onClick={() => N.createInvite(format)}>Freund einladen</button>
        </div>
      </section>
      <section className="box">
        <h3>Deine Online-Ratings</h3>
        <div className="side-stats">
          {Object.entries(KINDS).map(([k, name]) => (
            <div key={k} className="stat"><span className="k">{name}</span><span className="v">{o[k]?.rating ?? 1000}</span>
              <span className="d">{o[k] ? `${o[k].w} besser · ${o[k].d} gleich · ${o[k].l} schlechter` : 'noch kein Match'}{(o[k]?.games ?? 0) < MIN_RANKED ? ' · vorläufig' : ''}</span></div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: '.85rem' }}>Vorläufig bis {MIN_RANKED} gewertete Matches. Ranglisten zählen erst danach.</p>
      </section>
    </div>
  );
}

function Waiting({ on }) {
  useNow(1000);
  const secs = Math.max(0, Math.round((Date.now() - on.since) / 1000));
  const bot = FORMATS[on.format].kind === 'pf' ? '/spielen/arena' : '/spielen/duell';
  return (
    <section className="box" role="status" aria-live="polite">
      <h3>Suche Gegner …</h3>
      <p>{FORMATS[on.format].name} · Wartezeit <b className="math">{secs} s</b>. Je länger du wartest, desto größer wird der Rating-Abstand, den wir zulassen.</p>
      {secs >= 30 && <p className="notice">Gerade sind wenige Spieler online. Du kannst weiter warten oder <Link to={bot} onClick={N.cancelSearch}>gegen den Bot weiterspielen</Link>.</p>}
      <div><button className="btn" onClick={N.cancelSearch}>Abbrechen</button></div>
    </section>
  );
}

function InviteLink({ on }) {
  const url = `${location.origin}/spielen/online?einladung=${on.code}`;
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
  return (
    <section className="box">
      <h3>Freund einladen</h3>
      <p>Schick diesen Link an die Person, gegen die du spielen willst. Sobald sie annimmt, beginnt das Match ({FORMATS[on.format].name}). Der Link gilt 30 Minuten.</p>
      <label className="field" style={{ maxWidth: 560 }}>Link<input readOnly value={url} onFocus={e => e.target.select()} /></label>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" onClick={copy}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
        {navigator.share && <button className="btn" onClick={() => navigator.share({ title: 'Pokerschule', text: 'Spiel ein Match gegen mich', url }).catch(() => {})}>Teilen</button>}
        <button className="btn" onClick={N.cancelSearch}>Einladung zurückziehen</button>
      </div>
    </section>
  );
}

function Invitation({ code, onDone }) {
  const [info, setInfo] = useState(null), [err, setErr] = useState(null), on = useOnline();
  useEffect(() => { let alive = true; N.peekInvite(code).then(r => alive && setInfo(r), e => alive && setErr(e.message)); return () => { alive = false; }; }, [code]);
  if (err) return <div className="notice" role="alert">{err} <button className="btn" onClick={onDone}>Schließen</button></div>;
  if (!info) return <div className="loading" role="status" style={{ minHeight: 80 }}>Lade Einladung …</div>;
  if (info.own) return <div className="notice">Das ist deine eigene Einladung. Schick den Link an jemand anderen.</div>;
  return (
    <section className="box" style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
      <h3>{info.name} lädt dich ein</h3>
      <p>{FORMATS[info.format].name}. Ohne Echtgeld; gewertet wird die Qualität eurer Entscheidungen.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={on.busy} autoFocus onClick={async () => { await N.acceptInvite(code); onDone(); }}>Annehmen und spielen</button>
        <button className="btn" onClick={onDone}>Ablehnen</button>
      </div>
    </section>
  );
}

// ---------- Live-Tisch ----------
function Clock({ turn, bank, label }) {
  const now = useNow();
  const left = Math.max(0, turn.deadline - now), think = Math.max(0, turn.since + THINK_MS - now);
  const usingBank = think <= 0, pct = usingBank ? (bank ? left / bank : 0) : think / THINK_MS;
  return (
    <div className={'clock' + (usingBank ? ' bank' : '') + (left < 5000 ? ' low' : '')} role="timer" aria-label={`${label}: noch ${Math.ceil(left / 1000)} Sekunden`}>
      <span className="bar" style={{ width: `${Math.round(pct * 100)}%` }} />
      <span className="t">{usingBank ? `Zeitbank ${Math.ceil(left / 1000)} s` : `${Math.ceil(think / 1000)} s`}</span>
    </div>
  );
}

function Seat({ name, rating, pos, cards, stack, bet, me, turn, bank }) {
  return (
    <div className={'seat2' + (me ? ' me' : '')}>
      <div className="who"><b>{name}</b><span className="posbadge">{pos === 'SB' ? 'Small Blind · Button' : 'Big Blind'}</span>{rating && <span className="muted math" style={{ fontSize: '.8rem' }}>{rating}</span>}</div>
      <div className="row">{cards}</div>
      <div className="chips"><span>Stack <b>{b1(stack)} BB</b></span>{bet > 0 && <span className="bet">Einsatz <b>{b1(bet)} BB</b></span>}</div>
      {turn && <Clock turn={turn} bank={bank} label={me ? 'Deine Bedenkzeit' : 'Bedenkzeit des Gegners'} />}
    </div>
  );
}

function Table({ v, on }) {
  const now = useNow(), h = v.hand, last = v.hands[v.hands.length - 1];
  const pause = h && now < h.turn?.since && last;
  const [confirm, setConfirm] = useState(false);
  const opp = v.opp.name, kind = v.kind;
  const stackOf = i => (kind === 'pf' ? v.stacks[i] : 100);
  let top, mid, bottom, line;
  if (pause || !h) {
    const x = last, show = x.cards;
    top = <Seat name={opp} rating={ratingText(v.opp)} pos={x.pos === 'SB' ? 'BB' : 'SB'} cards={show ? <Cards list={x.cards[1]} /> : <Backs />} stack={stackOf(1)} bet={0} />;
    mid = <><div className="row">{x.board ? <Cards list={x.board} /> : null}</div><span className="potline">{handResult(x, opp)}</span></>;
    bottom = <Seat me name="Du" rating={ratingText(v.me)} pos={x.pos} cards={show ? <Cards list={x.cards[0]} /> : <span className="muted">–</span>} stack={stackOf(0)} bet={0} />;
    line = x.log.map(l => actText(l, 'Du', opp));
  } else {
    const myTurn = h.turn?.who === 'me', oppPos = h.pos === 'SB' ? 'BB' : 'SB';
    top = <Seat name={opp} rating={ratingText(v.opp)} pos={oppPos} cards={<Backs />} stack={stackOf(1) - h.bets[1]} bet={h.bets[1]} turn={!myTurn ? h.turn : null} bank={v.banks[1]} />;
    mid = <span className="potline">Pot {b1(h.bets[0] + h.bets[1])} BB</span>;
    bottom = <Seat me name="Du" rating={ratingText(v.me)} pos={h.pos} cards={<Cards list={h.cards} />} stack={stackOf(0) - h.bets[0]} bet={h.bets[0]} turn={myTurn ? h.turn : null} bank={v.banks[0]} />;
    line = h.log.map(l => actText(l, 'Du', opp));
  }
  const options = !pause && h?.turn?.who === 'me' ? h.options : [];
  return (
    <div className="game">
      <div className="game-main">
        <div className="matchbar" aria-live="polite">
          <span>{FORMATS[v.format].name}</span>
          <span>Hand <b>{h?.no ?? v.handNo}</b> von {kind === 'pf' ? 'höchstens ' : ''}{v.totalHands}</span>
          <span>Chips: <b>{sg(v.net[0], 1)} BB</b></span>
          {!on.live && <span className="sync busy">Verbinde …</span>}
        </div>
        <div className="table">
          {top}
          {mid}
          {bottom}
          <div className="arlog" aria-live="polite">{line.map((t, i) => <span key={i}>{t}</span>)}</div>
        </div>
        <div className="actions">
          {options.map(o => <button key={o.a} className={'btn' + (o.a === 'fold' ? '' : ' primary')} disabled={on.busy} onClick={() => N.act(o.a)}>{o.label}</button>)}
          {!options.length && <p className="prompt muted">{pause ? 'Nächste Hand gleich …' : h?.turn ? `${opp} ist am Zug.` : ''}</p>}
        </div>
        {on.error && <p className="form-msg bad" role="alert">{on.error}</p>}
      </div>
      <aside className="game-side" aria-label="Match">
        <section className="box">
          <h3>Hände</h3>
          <div className="log">{v.hands.length ? [...v.hands].reverse().map(x => (
            <div className="lr" key={x.no}><span className="m">#{x.no}</span><b>{x.pos}</b><span className="hide-sm muted">{x.log.map(l => l.a === 'auto' ? 'auto' : `${l.who === 'me' ? 'Du' : opp} ${ACTION_NAME[l.a]}`).join(' · ')}</span><span className={'math ' + (x.result?.net > 0 ? 'up' : x.result?.net < 0 ? 'down' : '')}>{x.result ? sg(x.result.net, 1) : '–'}</span></div>
          )) : <p className="muted">Noch keine Hand beendet.</p>}</div>
        </section>
        <section className="box">
          <h3>So wird gewertet</h3>
          <p className="muted">Jede Entscheidung von euch beiden wird gegen das Gleichgewicht bewertet. Wer im Schnitt weniger EV verliert, gewinnt die Rating-Wertung, egal wer am Ende mehr Chips hat. Die Analyse siehst du nach dem Match.</p>
          {h?.commit && <p className="muted" style={{ fontSize: '.8rem', wordBreak: 'break-all' }}>Deck-Hash dieser Hand: <code>{h.commit.slice(0, 16)}…</code> Nach dem Match kannst du jedes Deck nachprüfen.</p>}
        </section>
        <div>{!confirm ? <button className="btn" onClick={() => setConfirm(true)}>Aufgeben …</button>
          : <div className="actions" style={{ justifyContent: 'flex-start' }}><button className="btn primary" style={{ background: 'var(--bad)' }} onClick={() => { setConfirm(false); N.resign(); }}>Ja, aufgeben (zählt als Niederlage)</button><button className="btn" autoFocus onClick={() => setConfirm(false)}>Weiterspielen</button></div>}</div>
      </aside>
    </div>
  );
}

function handResult(x, opp) {
  const r = x.result;
  if (!r) return 'Hand abgebrochen';
  const won = r.net > 0 ? `Du gewinnst ${b1(r.net)} BB` : r.net < 0 ? `${opp} gewinnt ${b1(-r.net)} BB` : 'Split Pot';
  return r.showdown ? `${won}. Deine Equity: ${nf(r.eq * 100, 0)} %, glücksbereinigt ${sg(r.luck, 1)} BB` : won;
}

// ---------- Nach dem Match ----------
const REASON = {
  bust: (l, names) => `${names[l]} hat keine Chips mehr.`,
  limit: () => 'Nach 40 Händen endet das Match; es zählt der Chipstand.',
  hands: () => 'Alle zehn Hände sind gespielt.',
  forfeit: (l, names) => `${names[l]} war länger als 60 Sekunden nicht verbunden. Das zählt als Aufgabe.`,
  resign: (l, names) => `${names[l]} hat aufgegeben.`,
  abandoned: () => 'Beide Spieler waren nicht mehr verbunden. Das Match wird nicht gewertet.',
};
const loserOf = r => r.loser ?? (r.chipsLead === null ? null : 1 - r.chipsLead);

function Finished({ v, on }) {
  const opp = v.opp.name, mine = v.rematch[0], theirs = v.rematch[1];
  const [oppId, setOppId] = useState(null);
  useEffect(() => { let alive = true; N.matchById(v.id).then(m => alive && m && setOppId(m.players[1 - m.seat]), () => {}); return () => { alive = false; }; }, [v.id]);
  return (<>
    <Summary record={v.record} seat={v.seat} names={['Du', opp]} />
    <div className="actions" style={{ justifyContent: 'flex-start' }}>
      {!v.next && <button className="btn primary" disabled={on.busy || mine} onClick={N.rematch}>{mine ? 'Revanche angeboten …' : theirs ? `${opp} will Revanche: annehmen` : 'Revanche'}</button>}
      <button className="btn" onClick={() => { N.leave(); N.findOpponent(v.format); }}>Neues Match</button>
      <button className="btn" onClick={N.leave}>Zur Lobby</button>
    </div>
    {on.error && <p className="form-msg bad" role="alert">{on.error}</p>}
    <Analysis record={v.record} seat={v.seat} names={['Du', opp]} matchId={v.id} oppId={oppId} />
  </>);
}

/** Ergebnis: Chips, Spielqualität beider Spieler, Rating-Änderung. names aus Sicht von seat: [ich, Gegner]. */
function Summary({ record, seat, names }) {
  const r = record.result, me = seat, op = 1 - seat;
  const byIdx = i => (i === me ? names[0] : names[1]);
  const better = r.better === null ? null : r.better === me;
  const head = r.score === null ? 'Nicht gewertet' : r.reason === 'forfeit' || r.reason === 'resign' ? (r.loser === me ? 'Match aufgegeben' : 'Gegner hat aufgegeben')
    : better === null ? 'Gleich gut entschieden' : better ? 'Du hast besser entschieden' : `${names[1]} hat besser entschieden`;
  const lo = loserOf(r);
  const chips = r.net[me];
  return (
    <section className="box">
      <div className={'matchend ' + (r.delta[me] > 0 ? 'good' : r.delta[me] < 0 ? 'bad' : '')}><b>{head}.</b> {REASON[r.reason](lo, [0, 1].map(byIdx))}</div>
      <div className="arena-top" style={{ marginTop: 12 }}>
        <div className="stat"><span className="k">Rating</span><span className={'v ' + (r.delta[me] > 0 ? 'up' : r.delta[me] < 0 ? 'down' : '')}>{r.delta[me] > 0 ? '+' : r.delta[me] < 0 ? '−' : '±'}{Math.abs(r.delta[me])}</span><span className="d">jetzt {r.ratings[me]} ({KINDS[record.kind]})</span></div>
        <div className="stat"><span className="k">Deine Spielqualität</span><span className="v">{r.quality[me] === null ? '–' : nf(r.quality[me], 1)}</span><span className="d">BB EV-Verlust pro 100 Entscheidungen ({r.n[me]})</span></div>
        <div className="stat"><span className="k">{names[1]}</span><span className="v">{r.quality[op] === null ? '–' : nf(r.quality[op], 1)}</span><span className="d">BB EV-Verlust pro 100 Entscheidungen ({r.n[op]})</span></div>
        <div className="stat"><span className="k">Chips</span><span className={'v ' + (chips > 0 ? 'up' : chips < 0 ? 'down' : '')}>{sg(chips, 1)}</span><span className="d">BB, glücksbereinigt {sg(r.luck[me], 1)} BB</span></div>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Das Chip-Ergebnis zählt nicht für das Rating, denn über einzelne Hände entscheidet oft das Glück. Gewertet wird, wer im Schnitt weniger EV verloren hat (kleiner ist besser).{r.n[me] + r.n[op] < 16 ? ' Bei wenigen Entscheidungen fällt die Wertung schwächer aus.' : ''}</p>
    </section>
  );
}

/** Jede Entscheidung beider Spieler mit Einstufung und EV-Verlust, Hand für Hand. */
function Analysis({ record, seat, names, matchId, oppId }) {
  const [who, setWho] = useState('all');
  const byHand = useMemo(() => {
    const m = new Map();
    for (const d of record.decisions) { if (!m.has(d.hand)) m.set(d.hand, []); m.get(d.hand).push(d); }
    return m;
  }, [record]);
  const name = s => (s === seat ? names[0] : names[1]);
  const show = d => who === 'all' || (who === 'me') === (d.seat === seat);
  const worst = [...record.decisions].filter(d => d.loss > 0).sort((a, b) => b.loss - a.loss).slice(0, 3);
  return (<>
    <section className="box">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <h3>Analyse aller Entscheidungen</h3>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>Zeigen
          <select value={who} onChange={e => setWho(e.target.value)}><option value="all">Beide</option><option value="me">Nur meine</option><option value="opp">Nur {names[1]}</option></select>
        </label>
      </div>
      {worst.length > 0 && <p className="muted">Teuerste Entscheidungen: {worst.map(d => `Hand ${d.hand}, ${name(d.seat)} (${nf(d.loss)} BB)`).join(' · ')}</p>}
      <p className="model"><span className="chip">Modell</span> {record.kind === 'pf' ? 'EV gegen das Push/Fold-Gleichgewicht (Nash) bei effektivem Stack. Grenze: Es gibt nur All-in oder Fold.' : 'EV im gelösten Preflop-Baum (2,5 / 10 / 22 / all-in), die Range des Gegners folgt aus seinen Aktionen im Gleichgewicht. Nach dem Flop zählt die Equity-Realisierung.'}</p>
    </section>
    {record.hands.map(h => {
      const ds = (byHand.get(h.no) || []).filter(show);
      if (!ds.length && who !== 'all') return null;
      const mePos = h.sb === seat ? 'SB' : 'BB', r = h.result, net = r ? (h.sb === seat ? r.sbNet : -r.sbNet) : null;
      return (
        <section className="box" key={h.no}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <b>Hand {h.no}</b><span className="muted">Du {mePos}</span>
            {h.cards && <span className="row" style={{ gap: 4, alignItems: 'center' }}><Cards small list={h.cards[seat]} /><span className="muted">gegen</span><Cards small list={h.cards[1 - seat]} /></span>}
            {net !== null && <span className={'math ' + (net > 0 ? 'up' : net < 0 ? 'down' : '')}>{sg(net, 1)} BB</span>}
          </div>
          {ds.length ? ds.map((d, i) => <Decision key={i} d={d} who={name(d.seat)} />) : <p className="muted">Keine Entscheidung in dieser Hand.</p>}
        </section>
      );
    })}
    <Verify record={record} />
    {matchId && oppId && <Report matchId={matchId} oppId={oppId} opp={names[1]} />}
  </>);
}

function Decision({ d, who }) {
  const verdict = d.q === 'eq' ? 'Die besten Optionen sind praktisch gleich gut.' : d.chosen === d.best || ['best', 'sharp'].includes(d.q) ? `${d.labels[d.chosen]} war richtig.` : `Besser wäre ${d.labels[d.best]} gewesen. EV-Verlust ${nf(d.loss)} BB.`;
  return (
    <div className="decision" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
      <span className="muted" style={{ fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>{who} · {d.pos} · {idLabel(d.cls)}{d.eff !== 100 ? ` · ${b1(d.eff)} BB effektiv` : ''} · {SPOT_NAME[d.node]}</span>
      <div className="head"><Badge q={d.q} /><span>{verdict}{d.timeout ? ' (Bedenkzeit abgelaufen)' : ''}</span><span className="muted math">{nf(d.ms / 1000, 1)} s</span></div>
      <div style={{ overflowX: 'auto' }}><table className="evt"><tbody>
        {d.labels.map((l, k) => <tr key={k} className={(k === d.best && d.q !== 'eq' ? 'best ' : '') + (k === d.chosen ? 'mine' : '')}><td>{l}{k === d.chosen ? ' (gewählt)' : ''}</td><td className="num">{sg(d.ev[k])} BB</td></tr>)}
      </tbody></table></div>
    </div>
  );
}

function Verify({ record }) {
  const [res, setRes] = useState(null);
  const run = async () => { setRes('…'); try { setRes(await verifyRecord(record, N.sha256)); } catch (e) { setRes(e.message); } };
  return (
    <section className="box">
      <h3>Decks nachprüfen</h3>
      <p className="muted">Vor jeder Hand hat der Server einen Hash des gemischten Decks veröffentlicht. Jetzt liegen Deck und Salt offen: Dein Browser rechnet nach, ob sie zum Hash passen und ob genau diese Karten ausgeteilt wurden.</p>
      <div><button className="btn" onClick={run} disabled={res === '…'}>Nachprüfen</button></div>
      {Array.isArray(res) && <p className={'form-msg ' + (res.length ? 'bad' : '')} role="status">{res.length ? `Abweichung in Hand ${res.join(', ')}. Bitte melde das.` : `Alle ${record.hands.length} Decks stimmen mit dem vorher veröffentlichten Hash überein.`}</p>}
      {typeof res === 'string' && res !== '…' && <p className="form-msg bad" role="alert">{res}</p>}
    </section>
  );
}

function Report({ matchId, oppId, opp }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState('solver'), [note, setNote] = useState(''), [msg, setMsg] = useState(null);
  if (!open) return <div><button className="btn" onClick={() => setOpen(true)}>{opp} melden …</button></div>;
  const send = async e => { e.preventDefault(); try { await N.report(matchId, oppId, reason, note.trim()); setMsg(['Danke, die Meldung ist eingegangen.', '']); } catch (err) { setMsg([err.message, 'bad']); } };
  return (
    <section className="box">
      <h3>{opp} melden</h3>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className="field">Grund<select value={reason} onChange={e => setReason(e.target.value)}>
          <option value="solver">Verdacht auf Solver-Hilfe</option><option value="name">Unangemessener Name</option><option value="stalling">Absichtliches Verzögern</option><option value="other">Sonstiges</option>
        </select></label>
        <label className="field">Anmerkung (optional)<textarea rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        <div className="actions" style={{ justifyContent: 'flex-start' }}><button className="btn primary" disabled={!!msg && !msg[1]}>Meldung senden</button><button type="button" className="btn" onClick={() => setOpen(false)}>Abbrechen</button></div>
        {msg && <p className={'form-msg ' + msg[1]} role="status">{msg[0]}</p>}
      </form>
    </section>
  );
}

// ---------- Verlauf ----------
function History() {
  const [rows, setRows] = useState(null), [err, setErr] = useState(null), on = useOnline();
  const finishedId = on.view?.status === 'finished' ? on.view.id : null;
  useEffect(() => { let alive = true; N.history().then(r => alive && setRows(r), e => alive && setErr(e.message)); return () => { alive = false; }; }, [finishedId]);
  if (err) return <p className="notice" role="alert">Der Match-Verlauf konnte nicht geladen werden: {err}</p>;
  if (!rows?.length) return null;
  return (
    <section className="box" style={{ padding: 0, overflow: 'hidden' }}>
      <h3 style={{ padding: '14px 16px 0' }}>Deine letzten Matches</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="board">
          <thead><tr><th>Datum</th><th>Gegner</th><th>Format</th><th style={{ textAlign: 'right' }}>Qualität</th><th style={{ textAlign: 'right' }}>Chips</th><th style={{ textAlign: 'right' }}>Rating</th></tr></thead>
          <tbody>{rows.map(m => {
            const r = m.record?.result, me = m.seat, op = 1 - me;
            if (!r) return null;
            return (
              <tr key={m.id}>
                <td><Link to={`/spielen/online/match/${m.id}`}>{new Date(m.finished_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</Link></td>
                <td>{m.names[op]}</td>
                <td className="muted">{FORMATS[m.format].name}</td>
                <td className="num">{r.quality[me] === null ? '–' : nf(r.quality[me], 1)} : {r.quality[op] === null ? '–' : nf(r.quality[op], 1)}</td>
                <td className="num">{sg(r.net[me], 1)}</td>
                <td className="num">{r.delta[me] > 0 ? '+' : r.delta[me] < 0 ? '−' : '±'}{Math.abs(r.delta[me])}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function Explainer() {
  return (
    <details className="box">
      <summary>Warum zählt nicht, wer die Chips gewinnt?</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <p>Im Poker gewinnt über ein paar Hände oft der Glücklichere. Ein Rating nach Chips würde deshalb vor allem Glück messen. Hier wird jede Entscheidung von euch beiden gegen das Gleichgewicht bewertet: Wie viel EV hat sie gegenüber der besten Option gekostet?</p>
        <p>Daraus ergibt sich die <b>Spielqualität</b>: verlorener EV in Big Blinds pro 100 Entscheidungen, kleiner ist besser. Wer die bessere Spielqualität hat, gewinnt die Elo-Wertung; der Abstand bestimmt, wie deutlich. Bei All-ins siehst du zusätzlich das <b>glücksbereinigte</b> Ergebnis, also deine Gewinnchance statt der Karten danach.</p>
        <p>Aufgeben oder eine Verbindung, die länger als 60 Sekunden weg ist, zählt als Niederlage. Karten mischt und verteilt nur der Server; dein Browser kennt die Karten des Gegners erst beim Showdown.</p>
        <p className="muted">Fair Play: Hilfe durch Solver oder andere Programme ist verboten. Auffällige Konten werden markiert und vom Betreiber geprüft. Alles Weitere in den <Link to="/regeln">Nutzungsbedingungen</Link>.</p>
      </div>
    </details>
  );
}

/** Analyse eines vergangenen Matches unter /spielen/online/match/:id. */
export function MatchPage() {
  const { id } = useParams(), acc = useAccount();
  const [m, setM] = useState(undefined), [err, setErr] = useState(null);
  useEffect(() => {
    if (!acc.user) return;
    let alive = true;
    N.matchById(id).then(r => alive && setM(r), e => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id, acc.user]);
  const head = <div className="page-head"><Link to="/spielen/online" className="eyebrow">← Online</Link><h1>Match-Analyse</h1>{m?.record && <p>{FORMATS[m.format].name} gegen {m.names[1 - m.seat]}, {new Date(m.finished_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>}</div>;
  if (!acc.user) return <>{head}<div className="notice"><Link to="/konto">Melde dich an</Link>, um deine Matches zu sehen.</div></>;
  if (err) return <>{head}<div className="notice" role="alert">{err}</div></>;
  if (m === undefined) return <>{head}<div className="loading" role="status">Lade Match …</div></>;
  if (!m?.record || m.seat < 0) return <>{head}<div className="notice">Dieses Match gibt es nicht, es läuft noch, oder du hast nicht mitgespielt.</div></>;
  const names = ['Du', m.names[1 - m.seat]];
  return (<>{head}<Summary record={m.record} seat={m.seat} names={names} /><Analysis record={m.record} seat={m.seat} names={names} matchId={m.id} oppId={m.players[1 - m.seat]} /></>);
}
