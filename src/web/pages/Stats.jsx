import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../useProgress.js';
import { insights, levelOf } from '../../modes/insights.js';
import { today } from '../../modes/progress.js';
import { QUAL } from '../../core/rating.js';
import { resetAll } from '../../modes/store.js';
import { mountBackup } from '../../modes/backup.js';
import ModeHost from '../ModeHost.jsx';
import { BACKUP } from '../markup.js';
import { Spark } from '../ui.jsx';

const nf = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
const Stat = ({ k, v, d }) => <div className="stat"><span className="k">{k}</span><span className="v">{v}</span><span className="d">{d}</span></div>;

function Activity({ days }) {
  const list = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = today(d); list.push({ k, lab: d.getDate() + '.', ...(days[k] || { n: 0, ok: 0 }) }); }
  const mx = Math.max(1, ...list.map(d => d.n)), W = 420, H = 120, bw = W / 14;
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" style={{ maxWidth: W, display: 'block' }} role="img" aria-label={`Entscheidungen pro Tag: ${list.filter(d => d.n).map(d => `${d.lab} ${d.n}`).join(', ') || 'keine'}`}>
      <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
      {list.map((d, i) => {
        const h = d.n / mx * (H - 16), x = i * bw + 4;
        return (<g key={d.k}>
          <rect x={x} y={H - h} width={bw - 8} height={h} rx="3" fill="var(--accent)" fillOpacity={d.n ? (.35 + .65 * (d.ok / d.n)).toFixed(2) : 0}><title>{`${d.k}: ${d.n} Entscheidungen, ${d.n ? Math.round(d.ok / d.n * 100) : 0} % richtig`}</title></rect>
          {d.n > 0 && <text x={x + (bw - 8) / 2} y={H - h - 4} textAnchor="middle" fontSize="10" fill="var(--muted)">{d.n}</text>}
          <text x={x + (bw - 8) / 2} y={H + 13} textAnchor="middle" fontSize="9.5" fill="var(--muted)">{d.lab}</text>
        </g>);
      })}
    </svg>
  );
}

function SpotRow({ s }) {
  return (
    <div className="lr" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <span><span className="muted" style={{ fontSize: '.78rem' }}>{s.title[0]}</span><br /><b>{s.title[1]}</b></span>
      <span className="m" style={{ textAlign: 'right' }}>{nf(s.avg)} BB/Entsch.<br />{Math.round(s.rate * 100)} % falsch · {s.n}×</span>
    </div>
  );
}

export default function Stats() {
  const state = useProgress(), ins = insights(state);
  const [confirm, setConfirm] = useState(false);
  const clsN = ins.order.reduce((a, q) => a + ins.cls[q], 0);
  const qv = o => o.t ? `${Math.round(o.c / o.t * 100)} % (${o.c}/${o.t})` : '–';
  return (<>
    <div className="page-head"><h1>Statistik</h1><p>Wie gut du entscheidest, wo du am meisten verlierst und was du als Nächstes üben solltest.</p></div>

    <div className="arena-top">
      <Stat k="Gesamt-Rating" v={ins.overall ?? '–'} d={ins.overall ? levelOf(ins.overall).name : 'Mittel der Modi'} />
      <Stat k="Genauigkeit" v={ins.accAll === null ? '–' : ins.accAll.toFixed(1).replace('.', ',') + ' %'} d={`${ins.totDec} bewertete Entscheidungen`} />
      <Stat k="EV-Verlust" v={ins.trackedN ? nf(ins.trackedLoss / ins.trackedN) : '–'} d="BB pro Entscheidung" />
      <Stat k="Aktive Tage" v={ins.activeDays} d={ins.streak ? `Serie: ${ins.streak} ${ins.streak === 1 ? 'Tag' : 'Tage'}` : 'heute noch nicht trainiert'} />
    </div>

    <div className="analysis" style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
      <span className="eyebrow">Empfehlung</span>
      <p>{ins.rec.text}</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <Link className="btn primary" to={ins.rec.path}>{ins.rec.cta}</Link>
        {ins.reviewOpen > 0 && <Link className="btn" to="/training/fehler">Fehler wiederholen ({ins.reviewOpen})</Link>}
      </div>
    </div>

    <div className="arena-top">
      {ins.played.map(m => (
        <Link key={m.k} to={m.path} className="stat" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="k">{m.name}</span>
          <span className="v">{m.dec ? Math.round(m.s.rating) : '–'}</span>
          <span className="d">{m.dec ? `${m.acc.toFixed(1).replace('.', ',')} % genau · ${m.dec} Entsch.` : 'Noch nicht gespielt'}</span>
          <Spark values={m.s.hist} />
        </Link>
      ))}
    </div>

    <div className="grid2">
      <section className="box"><h3>Größte Lecks</h3>
        {ins.weak.length ? <div className="log">{ins.weak.map(s => <SpotRow key={s.k} s={s} />)}</div> : <p className="muted">Sobald du eine Situation mindestens dreimal gespielt hast, erscheint sie hier, sortiert nach deinem EV-Verlust.</p>}
      </section>
      <section className="box"><h3>Am sichersten</h3>
        {ins.strong.length ? <div className="log">{ins.strong.map(s => <SpotRow key={s.k} s={s} />)}</div> : <p className="muted">Situationen mit mindestens fünf Entscheidungen und höchstens 30 % Fehlern erscheinen hier.</p>}
        <h3 style={{ marginTop: 8 }}>Quiz</h3>
        <div className="log">
          <div className="lr" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>Wer gewinnt?</span><span className="m">{qv(state.quiz.show)}</span></div>
          <div className="lr" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>Raise oder Fold?</span><span className="m">{qv(state.quiz.pre)}</span></div>
          <div className="lr" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>Pot Odds</span><span className="m">{qv(state.quiz.odds)}</span></div>
        </div>
      </section>
    </div>

    <div className="grid2">
      <section className="box"><h3>Wie gut sind deine Entscheidungen?</h3>
        {clsN ? (<>
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label={ins.order.map(q => `${QUAL[q][0]} ${ins.cls[q]}`).join(', ')}>
            {ins.order.map(q => ins.cls[q] ? <span key={q} title={`${QUAL[q][0]}: ${ins.cls[q]}`} style={{ width: `${ins.cls[q] / clsN * 100}%`, background: `var(${QUAL[q][1]})` }} /> : null)}
          </div>
          <div className="legend">{ins.order.map(q => <span key={q}><span className="swatch" style={{ background: `var(${QUAL[q][1]})` }} /> {QUAL[q][0]} {ins.cls[q]} ({Math.round(ins.cls[q] / clsN * 100)} %)</span>)}</div>
        </>) : <p className="muted">Noch keine bewerteten Entscheidungen.</p>}
      </section>
      <section className="box" style={{ minWidth: 0 }}><h3>Aktivität, letzte 14 Tage</h3><Activity days={state.dash.days} /><p className="muted" style={{ fontSize: '.8rem' }}>Balkenhöhe: Anzahl Entscheidungen. Kräftigere Farbe: höherer Anteil richtiger Entscheidungen.</p></section>
    </div>

    <ModeHost html={BACKUP} mount={mountBackup} />

    <section className="box">
      <h3>Fortschritt zurücksetzen</h3>
      <p className="muted">Löscht alle Ratings, Statistiken und gespeicherten Fehler in diesem Browser. Sichere vorher eine Datei, wenn du ihn behalten willst.</p>
      {!confirm
        ? <div><button className="btn" onClick={() => setConfirm(true)}>Alles zurücksetzen …</button></div>
        : <div className="actions" style={{ justifyContent: 'flex-start' }}><button className="btn primary" style={{ background: 'var(--bad)' }} onClick={() => { resetAll(); setConfirm(false); }}>Ja, alles löschen</button><button className="btn" autoFocus onClick={() => setConfirm(false)}>Abbrechen</button></div>}
    </section>
  </>);
}
