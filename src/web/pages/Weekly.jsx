// Wochen-Challenge: 20 gleiche Spots für alle, einmal spielen, Ergebnis nach der Abgabe, Auflösung am Sonntag.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as K from '../../modes/community.js';
import { weekOf, weekNumber } from '../../core/community.js';
import { nf, sg } from '../../modes/dom.js';
import { useAccount } from './Account.jsx';
import { CommunityTabs, SpotTable, SpotChoices, SpotFeedback, BoardTable, NeedAccount, useLoad, useAction, Who, fmtMs, fmtDate } from '../community.jsx';

const Head = () => (
  <div className="page-head">
    <h1>Wochen-Challenge</h1>
    <p>Jede Woche dieselben 20 Situationen für alle, gemischt aus Flop, River und Preflop-Duell. Gewertet wird der durchschnittliche EV-Verlust, bei Gleichstand die schnellere Zeit.</p>
    <CommunityTabs />
  </div>
);

export default function Weekly() {
  const acc = useAccount();
  const [week, setWeek] = useState(null); // null: laufende Woche
  if (!K.enabled || !acc.user) return (<>
    <Head />
    <NeedAccount enabled={K.enabled} user={acc.user} what="Die Wochen-Challenge und ihre Wertung" />
    {K.enabled && <WeekBoard week={weekOf().key} user={null} />}
  </>);
  return (<>
    <Head />
    {week ? <Review week={week} onBack={() => setWeek(null)} /> : <Current />}
    <PastWeeks current={week} onPick={setWeek} />
  </>);
}

function Current() {
  const cur = useLoad(K.weekCurrent, []);
  const [data, setData] = useState(null);
  const [busy, error, run] = useAction();
  const d = data || cur.data;
  if (cur.error) return <div className="notice" role="alert">Die Challenge konnte nicht geladen werden: {cur.error} <button className="btn" onClick={cur.reload}>Erneut versuchen</button></div>;
  if (!d) return <div className="loading" role="status">Lade Challenge …</div>;
  const n = weekNumber(d.week);
  const update = async fn => { const r = await run(fn); if (r) setData(r); };

  if (d.next) return (
    <div className="game">
      <div className="game-main">
        <div className="matchbar" aria-live="polite"><span>Woche {n}</span><span>Spot <b>{d.next.index + 1}</b> von {d.total}</span><span>läuft bis {fmtDate(d.ends_at)}</span></div>
        <progress className="progress" max={d.total} value={d.next.index} aria-label={`${d.next.index} von ${d.total} beantwortet`} />
        <SpotTable spot={d.next.spot} />
        <SpotChoices spot={d.next.spot} disabled={busy} onPick={k => update(() => K.weekAnswer(d.week, d.next.index, k))} />
        {error && <p className="form-msg bad" role="alert">{error}</p>}
      </div>
      <aside className="game-side">
        <section className="box">
          <h3>So läuft es</h3>
          <p className="muted">Jede Antwort ist endgültig. Die Auswertung siehst du erst, wenn alle {d.total} Spots beantwortet sind. Es gibt kein Zeitlimit; die Zeit entscheidet nur bei Gleichstand.</p>
          <p className="muted">Du kannst jederzeit aufhören und später weitermachen, bis {fmtDate(d.ends_at)}.</p>
        </section>
      </aside>
    </div>
  );

  return (<>
    {!d.started && !d.ended && (
      <section className="box">
        <h3>Woche {n}: {d.total} Spots warten</h3>
        <p>Für alle gleich, ohne Zeitlimit, jede Antwort zählt sofort. Nach der Abgabe siehst du deine Analyse und deinen Platz; am Sonntagabend wird aufgelöst, wie alle anderen entschieden haben.</p>
        <p className="muted">Läuft bis {fmtDate(d.ends_at)}. In der globalen Wertung erscheinst du mit deinem Anzeigenamen, wenn dein Profil öffentlich ist; in Gruppen und unter Freunden immer.</p>
        <div><button className="btn primary lg" disabled={busy} onClick={() => update(K.weekStart)}>Challenge starten</button></div>
        {error && <p className="form-msg bad" role="alert">{error}</p>}
      </section>
    )}
    {d.ended && !d.done && <p className="notice">Diese Woche ist abgeschlossen{d.started ? ', bevor du alle Spots beantwortet hast' : ''}. Hier ist die Auflösung.</p>}
    {(d.done || d.ended) && <Result d={d} />}
    <WeekBoard key={d.done ? 'abgegeben' : 'offen'} week={d.week} user />
  </>);
}

function Review({ week, onBack }) {
  const r = useLoad(() => K.weekReview(week), [week]);
  return (<>
    <div><button className="btn" onClick={onBack}>← Zur laufenden Woche</button></div>
    {r.error && <div className="notice" role="alert">{r.error}</div>}
    {r.data === undefined && !r.error && <div className="loading" role="status">Lade Woche …</div>}
    {r.data && (r.data.spots ? <Result d={r.data} /> : <p className="notice">Die Auflösung gibt es nach deiner Abgabe oder nach dem Ende der Woche.</p>)}
    <WeekBoard week={week} user />
  </>);
}

/** Ergebnis und Analyse aller Spots; mit Verteilung der Antworten nach dem Abschluss. */
function Result({ d }) {
  const res = d.result, stats = d.stats;
  return (<>
    {res && (
      <div className="arena-top">
        <div className="stat"><span className="k">EV-Verlust im Schnitt</span><span className="v">{nf(res.loss)}</span><span className="d">BB je Spot</span></div>
        <div className="stat"><span className="k">Richtig</span><span className="v">{res.good} / {d.total}</span><span className="d">Bester Zug, präzise oder gleichwertig</span></div>
        <div className="stat"><span className="k">Zeit</span><span className="v">{fmtMs(res.ms)}</span><span className="d">zählt nur bei Gleichstand</span></div>
      </div>
    )}
    {!stats && <p className="muted">{d.ended ? 'Die Verteilung der Antworten wird gerade berechnet.' : `Wie alle anderen entschieden haben, siehst du nach dem Ende der Woche (${fmtDate(d.ends_at)}).`}</p>}
    <section className="box">
      <h3>Analyse aller Spots{stats ? ` · ${stats.n} Teilnehmende` : ''}</h3>
      <div className="spot-list">
        {d.spots.map((s, i) => {
          const it = res?.items[i];
          return (
            <details key={i} open={!!it && !['best', 'sharp', 'eq'].includes(it.q) && i < 3}>
              <summary>Spot {i + 1}: {s.face} {it ? <span className="muted">· {s.options[it.c]}{it.loss > .005 ? `, −${nf(it.loss)} BB` : ''}</span> : null}</summary>
              <div className="spot-review">
                <SpotTable spot={s} />
                {it ? <SpotFeedback spot={s} choice={it.c} dist={stats?.spots[i]} /> : <BestOnly spot={s} dist={stats?.spots[i]} />}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  </>);
}
/** Für Spots ohne eigene Antwort: nur die beste Option und die Verteilung. */
function BestOnly({ spot, dist }) {
  const bi = spot.ev.indexOf(Math.max(...spot.ev));
  return (
    <div className="analysis">
      <p>Beste Option: <b>{spot.options[bi]}</b>.</p>
      <table className="evt"><tbody>{spot.options.map((o, k) => <tr key={k} className={k === bi ? 'best' : ''}><td>{o}</td>{dist && <td className="num muted">{Math.round(dist.share[k] * 100)} %</td>}<td className="num">{sg(spot.ev[k])} BB</td></tr>)}</tbody></table>
      <p className="model"><span className="chip">Modell</span> {spot.model}</p>
    </div>
  );
}

function WeekBoard({ week, user }) {
  const [scope, setScope] = useState('all');
  const groups = useLoad(() => user ? K.myGroups() : [], [user]);
  const isGroup = scope.startsWith('g:');
  const b = useLoad(() => K.weeklyBoard({ week, scope: isGroup ? 'group' : scope, group: isGroup ? scope.slice(2) : null }), [week, scope]);
  return (
    <section className="box">
      <div className="panel-title">
        <h3>Wertung Woche {weekNumber(week)}</h3>
        {user && <select aria-label="Wer" value={scope} onChange={e => setScope(e.target.value)}>
          <option value="all">Alle</option><option value="friends">Freunde</option>
          {(groups.data || []).map(g => <option key={g.id} value={'g:' + g.id}>Gruppe: {g.name}</option>)}
        </select>}
      </div>
      {b.error && <p className="form-msg bad" role="alert">{b.error}</p>}
      {b.data && !b.data.length && <p className="muted">Noch hat niemand abgegeben.</p>}
      {b.data?.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="board">
            <thead><tr><th>#</th><th>Spieler</th><th style={{ textAlign: 'right' }}>EV-Verlust</th><th className="hide-sm" style={{ textAlign: 'right' }}>Richtig</th><th style={{ textAlign: 'right' }}>Zeit</th></tr></thead>
            <tbody>{b.data.map(r => (
              <tr key={r.pos} className={r.me ? 'you' : ''}>
                <td className="num" style={{ textAlign: 'left' }}>{r.pos}</td>
                <td><Who name={r.name} avatar={r.avatar} isPublic={r.is_public} /></td>
                <td className="num">{nf(r.loss)} BB</td><td className="num hide-sm">{r.good}/20</td><td className="num">{fmtMs(r.ms)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: '.85rem' }}>{b.data?.length ? `${b.data[0].total} ${b.data[0].total === 1 ? 'hat' : 'haben'} abgegeben. ` : ''}Weniger EV-Verlust ist besser. {scope === 'all' ? 'Der Platz zählt unter allen Teilnehmenden; angezeigt werden öffentliche Profile und deine eigene Zeile.' : 'Der Platz zählt in diesem Kreis.'}</p>
    </section>
  );
}

function PastWeeks({ current, onPick }) {
  const w = useLoad(K.weekList, []);
  const past = (w.data?.weeks || []).filter(x => x.week !== weekOf().key);
  if (!past.length) return null;
  return (
    <section className="box">
      <h3>Frühere Wochen</h3>
      <div className="log">{past.map(x => (
        <div className="lr week-row" key={x.week}>
          <span className="m">KW {weekNumber(x.week)}</span>
          <span>{new Date(x.starts_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
          <span className="muted">{x.done ? `${nf(x.loss)} BB im Schnitt` : 'nicht abgegeben'}</span>
          <button className="btn" aria-pressed={current === x.week} onClick={() => onPick(x.week)}>Ansehen</button>
        </div>
      ))}</div>
      <p className="muted" style={{ fontSize: '.85rem' }}>Die Wochen-Challenge zählt für kein Rating. <Link to="/rangliste">Zur Rangliste</Link></p>
    </section>
  );
}
