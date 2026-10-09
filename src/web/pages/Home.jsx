import { Link } from 'react-router-dom';
import { useProgress } from '../useProgress.js';
import { insights, levelOf } from '../../modes/insights.js';
import { IconPlay, IconTarget, IconBook, IconRepeat, IconUsers } from '../icons.jsx';
import { Spark, Card } from '../ui.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

export default function Home() {
  const state = useProgress(), ins = insights(state);
  const fresh = !ins.totDec && !ins.quizN;
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">{greeting()}</span>
        <h1>{fresh ? 'Willkommen in der Pokerschule' : 'Weiter geht’s.'}</h1>
        <p>{fresh ? 'Lerne No-Limit Hold’em wie Schach: Jede Entscheidung wird gegen einen Solver bewertet, nicht das Ergebnis der Karten.' : ins.rec.text}</p>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <Link to="/spielen/arena" className="tile hero">
          <span className="eyebrow" style={{ color: 'inherit', opacity: .8 }}>Jetzt spielen</span>
          <h2>Push/Fold-Arena</h2>
          <p>Ein schnelles Heads-up-Match gegen einen Bot. Nach jeder Hand siehst du, wie gut deine Entscheidung war.</p>
          <div className="tile-meta"><span className="btn primary" style={{ background: '#fff', color: 'var(--felt-b)' }}>Match starten</span></div>
          <div className="hero-cards" aria-hidden="true">
            <Card r={14} s={0} /><Card r={13} s={1} />
          </div>
        </Link>
        <div className="box">
          <div className="panel-title"><h3>Deine Ratings</h3><Link to="/statistik" className="muted" style={{ fontSize: '.85rem' }}>Alle Statistiken</Link></div>
          {ins.played.map(m => (
            <Link key={m.k} to={m.path} className="rating-row">
              <span><span className="rr-name">{m.name}</span><small>{m.dec ? levelOf(m.s.rating).name : 'noch nicht gespielt'}</small></span>
              <b>{m.dec ? Math.round(m.s.rating) : '–'}</b>
            </Link>
          ))}
          {ins.overall && <p className="muted" style={{ fontSize: '.85rem' }}>Gesamt-Rating <b style={{ color: 'var(--fg)' }}>{ins.overall}</b> · Genauigkeit {ins.accAll.toFixed(1).replace('.', ',')} %</p>}
        </div>
      </div>

      <div className="grid3">
        <Link to={ins.rec.path} className="tile">
          <span className="tile-icon"><IconTarget /></span>
          <h3>{ins.rec.kind === 'leak' ? 'Dein Training für heute' : ins.rec.kind === 'start' ? 'Erste Schritte' : 'Empfohlen'}</h3>
          <p>{ins.rec.kind === 'leak' ? `${ins.rec.spot.title[0]} · ${ins.rec.spot.title[1]}` : ins.rec.text}</p>
          <div className="tile-meta"><span className="chip">{ins.rec.cta}</span></div>
        </Link>
        <Link to="/training/fehler" className="tile">
          <span className="tile-icon"><IconRepeat /></span>
          <h3>Fehler wiederholen</h3>
          <p>{ins.reviewOpen ? `${ins.reviewOpen} ${ins.reviewOpen === 1 ? 'Situation wartet' : 'Situationen warten'} darauf, dass du sie richtig löst.` : 'Noch keine offenen Fehler. Sie landen hier automatisch.'}</p>
          <div className="tile-meta"><span className="chip">{state.review.mastered} gemeistert</span></div>
        </Link>
        <Link to="/spielen/duell" className="tile">
          <span className="tile-icon"><IconPlay /></span>
          <h3>Gegen den Solver</h3>
          <p>Preflop-Duell mit 100 BB: Raises, 3-Bets und 4-Bets gegen das Gleichgewicht.</p>
          <div className="tile-meta"><span className="chip">Rating {Math.round(state.duel.rating)}</span></div>
        </Link>
        <Link to="/lernen" className="tile">
          <span className="tile-icon"><IconBook /></span>
          <h3>Lernen</h3>
          <p>Ablauf einer Hand, Rangfolge, Positionen und Open-Ranges.</p>
          <div className="tile-meta"><span className="chip">Für Einsteiger</span></div>
        </Link>
        <Link to="/training/river" className="tile">
          <span className="tile-icon"><IconTarget /></span>
          <h3>River-Rätsel</h3>
          <p>Exakt gelöste Spots: Value-Bet, Bluff oder Check? Callen oder folden?</p>
          <div className="tile-meta"><span className="chip">Rating {Math.round(state.river.rating)}</span></div>
        </Link>
        <div className="tile disabled" aria-disabled="true">
          <span className="tile-icon"><IconUsers /></span>
          <h3>Gegen Menschen spielen</h3>
          <p>Online-Spiel, Konten und Ranglisten mit anderen Spielern kommen in einem späteren Schritt.</p>
          <div className="tile-meta"><span className="chip">Demnächst</span></div>
        </div>
      </div>

      {!fresh && (
        <div className="box">
          <div className="panel-title"><h3>Rating-Verlauf Arena</h3><span className="muted" style={{ fontSize: '.85rem' }}>{state.arena.n} bewertete Entscheidungen</span></div>
          <Spark values={state.arena.hist} width={680} height={80} />
        </div>
      )}
    </>
  );
}
