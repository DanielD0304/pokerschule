import { Link } from 'react-router-dom';
import { useProgress } from '../useProgress.js';
import { insights, LEVELS } from '../../modes/insights.js';

export default function Leaderboard() {
  const state = useProgress(), ins = insights(state);
  const rows = [...LEVELS.map(l => ({ ...l, you: false }))];
  if (ins.overall) rows.push({ name: 'Du', rating: ins.overall, note: `${ins.totDec} bewertete Entscheidungen`, you: true });
  rows.sort((a, b) => b.rating - a.rating);
  return (<>
    <div className="page-head">
      <h1>Rangliste</h1>
      <p>Wo du stehst, gemessen an Referenzspielern. Das Rating bewertet deine Entscheidungen, nicht ob du Hände gewinnst.</p>
    </div>
    <div className="box" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="board">
        <thead><tr><th>#</th><th>Spieler</th><th>Beschreibung</th><th style={{ textAlign: 'right' }}>Rating</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} className={r.you ? 'you' : ''}>
              <td className="num" style={{ textAlign: 'left' }}>{i + 1}</td>
              <td>{r.name}</td>
              <td className="muted">{r.note}</td>
              <td className="num">{r.rating}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!ins.overall && <p className="notice">Du erscheinst hier, sobald du bewertete Entscheidungen gesammelt hast, zum Beispiel in der <Link to="/spielen/arena">Arena</Link>.</p>}
    <p className="notice">Die Referenzspieler stammen aus der Kalibrierung mit simulierten Spielern unterschiedlicher Stärke. Eine Rangliste mit echten Spielern kommt zusammen mit Konten und dem Online-Spiel.</p>
  </>);
}
