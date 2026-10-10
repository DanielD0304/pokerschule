// Gemeinsame Bausteine für Ranglisten, Wochen-Challenge, Gruppen und Freunde (Roadmap 03).
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { icard } from '../core/cards.js';
import { QUAL } from '../core/rating.js';
import { answer } from '../core/spots.js';
import { BOARDS } from '../core/community.js';
import { nf, sg } from '../modes/dom.js';
import { Card } from './ui.jsx';
import { AVATARS } from './pages/Account.jsx';

export function CommunityTabs() {
  const tabs = [['/rangliste', 'Rangliste', true], ['/rangliste/woche', 'Wochen-Challenge'], ['/rangliste/gruppen', 'Gruppen'], ['/rangliste/freunde', 'Freunde']];
  return (
    <nav className="segmented" aria-label="Community">
      {tabs.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
    </nav>
  );
}

/** Lädt Daten mit load(); reload() lädt neu. Fehler als Text. */
export function useLoad(load, deps) {
  const [state, setState] = useState({ data: undefined, error: null });
  const run = useCallback(() => {
    let alive = true;
    setState(s => ({ ...s, error: null }));
    Promise.resolve().then(load).then(data => alive && setState({ data, error: null }), e => alive && setState({ data: null, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

/** Führt eine Aktion aus und merkt sich Fehler; liefert [busy, error, run, setError]. */
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e.message); return undefined; } finally { setBusy(false); }
  };
  return [busy, error, run, setError];
}

export const Badge = ({ q }) => <span className="badge" style={{ '--c': `var(${QUAL[q][1]})` }}>{QUAL[q][0]}</span>;
export const Who = ({ name, avatar, isPublic }) => (
  <span className="who-cell">
    <span className="mini-avatar" aria-hidden="true">{AVATARS[avatar] || (name || '?')[0].toUpperCase()}</span>
    {isPublic ? <Link to={`/spieler/${encodeURIComponent(name)}`}>{name}</Link> : <span>{name}</span>}
  </span>
);
export const fmtMs = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`; };
export const fmtDate = t => new Date(t).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Link mit Kopieren- und Teilen-Knopf. */
export function ShareLink({ url, text, label = 'Link' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
  return (<>
    <label className="field" style={{ maxWidth: 560 }}>{label}<input readOnly value={url} onFocus={e => e.target.select()} /></label>
    <div className="actions" style={{ justifyContent: 'flex-start' }}>
      <button className="btn primary" onClick={copy}>{copied ? 'Kopiert' : 'Link kopieren'}</button>
      {navigator.share && <button className="btn" onClick={() => navigator.share({ title: 'Pokerschule', text, url }).catch(() => {})}>Teilen</button>}
    </div>
  </>);
}

// ---------- Ranglisten-Tabelle ----------

/**
 * rows aus leaderboard(): { pos, name, avatar, rating, n, gain, me, is_public }; Referenzspieler mit ref: true.
 * gain zeigt den Zuwachs im Zeitraum.
 */
export function BoardTable({ rows, board, gain, empty }) {
  if (!rows.length) return <p className="notice">{empty}</p>;
  const unit = BOARDS[board].unit;
  return (
    <div className="box" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="board">
          <thead><tr><th>#</th><th>Spieler</th><th className="hide-sm" style={{ textAlign: 'right' }}>{unit}</th>{gain && <th style={{ textAlign: 'right' }}>Zuwachs</th>}<th style={{ textAlign: 'right' }}>Rating</th></tr></thead>
          <tbody>
            {rows.map((r, i) => r.ref ? (
              <tr key={'ref' + r.name} className="ref">
                <td />
                <td><span className="chip">Referenz</span> {r.name} <span className="muted hide-sm">· {r.note}</span></td>
                <td className="hide-sm" />{gain && <td />}
                <td className="num">{r.rating}</td>
              </tr>
            ) : (
              <tr key={r.pos + r.name + i} className={r.me ? 'you' : ''}>
                <td className="num" style={{ textAlign: 'left' }}>{r.pos}</td>
                <td><Who name={r.name} avatar={r.avatar} isPublic={r.is_public} />{r.me && <span className="visually-hidden"> (du)</span>}</td>
                <td className="num hide-sm">{r.n}</td>
                {gain && <td className={'num ' + (r.gain > 0 ? 'up' : r.gain < 0 ? 'down' : '')}>{r.gain > 0 ? '+' : r.gain < 0 ? '−' : '±'}{Math.abs(r.gain)}</td>}
                <td className="num">{r.rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Ein Spot am Tisch ----------

const posText = (kind, pos) => kind === 'duel' ? (pos === 'SB' ? 'Small Blind · Button' : 'Big Blind') : `${pos} · ${pos === 'SB' ? 'in Position' : 'out of position'}`;
const Cards = ({ list }) => list.map(n => { const c = icard(n); return <Card key={n} r={c.r} s={c.s} />; });

export function SpotTable({ spot }) {
  const opp = spot.pos === 'SB' ? 'BB' : 'SB';
  const line = spot.line.map(l => `${l.pos === spot.pos ? 'Du' : 'Gegner'} ${l.name}`).join(' · ');
  return (
    <div className="table">
      <div className="seat"><span className="label">Gegner · {posText(spot.kind, opp)}</span><div className="row">
        <div className="card back" role="img" aria-label="verdeckte Karte" /><div className="card back" role="img" aria-label="verdeckte Karte" /></div></div>
      <span className="label" style={{ maxWidth: '52ch', textTransform: 'none', letterSpacing: 0, fontSize: '.8rem' }}>{spot.context}</span>
      {spot.board.length > 0 && <div className="row"><Cards list={spot.board} /></div>}
      <span className="potline">Pot {nf(spot.pot, spot.pot % 1 ? 2 : 0)} BB</span>
      <span style={{ fontSize: '.9rem', minHeight: '1.4em' }}>{line || ' '}</span>
      <div className="seat"><div className="row"><Cards list={spot.hero} /></div><span className="label">Du · {posText(spot.kind, spot.pos)}</span></div>
    </div>
  );
}

export function SpotChoices({ spot, onPick, disabled }) {
  return (<>
    <p className="prompt"><b>{spot.face}</b> Was machst du?</p>
    <div className="actions">
      {spot.options.map((o, k) => <button key={k} className={'btn' + (/^(Fold|Check)$/.test(o) ? '' : ' primary')} disabled={disabled} onClick={() => onPick(k)}>{o}</button>)}
    </div>
  </>);
}

/** Analyse einer Antwort: Einstufung, EV aller Optionen, Gleichgewicht, optional wie alle anderen geantwortet haben. */
export function SpotFeedback({ spot, choice, dist, title }) {
  const r = answer(spot, choice);
  const verdict = r.q === 'eq' ? 'Die besten Optionen sind praktisch gleich gut.' : r.correct ? `${spot.options[choice]} war richtig.` : <>Besser wäre <b>{spot.options[r.bi]}</b> gewesen. EV-Verlust: <b>{nf(r.loss)} BB</b>.</>;
  const mix = spot.options.map((o, k) => spot.mix[k] >= .01 ? `${o} ${Math.round(spot.mix[k] * 100)} %` : '').filter(Boolean).join(', ');
  return (
    <div className="analysis">
      {title && <span className="muted" style={{ fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase' }}>{title}</span>}
      <div className="head"><Badge q={r.q} /><span>{verdict}</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="evt"><tbody>
          {spot.options.map((o, k) => (
            <tr key={k} className={(k === r.bi && r.q !== 'eq' ? 'best ' : '') + (k === choice ? 'mine' : '')}>
              <td>{o}{k === choice ? ' (deine Wahl)' : ''}</td>
              {dist && <td className="num muted" title="Anteil aller Teilnehmer">{Math.round(dist.share[k] * 100)} %</td>}
              <td className="num">{sg(spot.ev[k])} BB</td>
            </tr>
          ))}
        </tbody></table>
      </div>
      {dist && <p className="muted" style={{ fontSize: '.85rem' }}>Die Prozentwerte zeigen, wie {dist.n} {dist.n === 1 ? 'Teilnehmer' : 'Teilnehmende'} hier entschieden haben.</p>}
      {mix && <p>Das Gleichgewicht spielt deine Hand hier so: <b>{mix}</b>.</p>}
      <p className="model"><span className="chip">Modell</span> {spot.model}</p>
    </div>
  );
}

/** Kurzer Hinweis, wenn Konten fehlen oder niemand angemeldet ist. */
export function NeedAccount({ enabled, user, what }) {
  if (!enabled) return <div className="notice">{what} brauchen Konten, und die sind auf dieser Installation nicht eingerichtet.</div>;
  if (!user) return <div className="notice">{what} gibt es mit einem kostenlosen Konto. <Link to="/konto">Anmelden oder Konto anlegen</Link></div>;
  return null;
}
