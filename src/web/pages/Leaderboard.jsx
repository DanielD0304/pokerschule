// Ranglisten: global, Freunde, Gruppe; Rating oder Zuwachs dieser Woche bzw. dieses Monats (Roadmap 03).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../useProgress.js';
import { insights, LEVELS } from '../../modes/insights.js';
import * as K from '../../modes/community.js';
import { BOARDS, PERIODS, MIN_DECISIONS, absence, boardValue, minFor, withReference, badgesOf, weekOf, monthOf } from '../../core/community.js';
import { useAccount } from './Account.jsx';
import { CommunityTabs, BoardTable, useLoad } from '../community.jsx';

const Head = () => (
  <div className="page-head">
    <h1>Rangliste</h1>
    <p>Wo du stehst, im Vergleich mit anderen Lernenden. Das Rating bewertet deine Entscheidungen gegen den Solver, nicht ob du Hände gewinnst.</p>
    <CommunityTabs />
  </div>
);

/** Ohne Konten: nur die Referenzspieler aus der Kalibrierung und das eigene Rating aus diesem Browser. */
function ReferenceOnly() {
  const state = useProgress(), ins = insights(state);
  const rows = LEVELS.map(l => ({ ...l, you: false }));
  if (ins.overall) rows.push({ name: 'Du', rating: ins.overall, note: `${ins.totDec} bewertete Entscheidungen`, you: true });
  rows.sort((a, b) => b.rating - a.rating);
  return (<>
    <div className="box" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="board">
        <thead><tr><th>#</th><th>Spieler</th><th className="hide-sm">Beschreibung</th><th style={{ textAlign: 'right' }}>Rating</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.name} className={r.you ? 'you' : ''}><td className="num" style={{ textAlign: 'left' }}>{i + 1}</td><td>{r.name}</td><td className="muted hide-sm">{r.note}</td><td className="num">{r.rating}</td></tr>
        ))}</tbody>
      </table>
    </div>
    {!ins.overall && <p className="notice">Du erscheinst hier, sobald du bewertete Entscheidungen gesammelt hast, zum Beispiel in der <Link to="/spielen/arena">Arena</Link>.</p>}
    <p className="notice">Die Referenzspieler stammen aus der Kalibrierung mit simulierten Spielern unterschiedlicher Stärke. Ranglisten mit echten Spielern gibt es, sobald Konten eingerichtet sind.</p>
  </>);
}

/** Warum du (noch) nicht in der globalen Rangliste stehst. */
function MyStatus({ profile, board }) {
  const a = absence(profile, board);
  if (!a) return null;
  const unit = BOARDS[board].unit;
  const text = {
    account: <>Mit einem <Link to="/konto">Konto</Link> erscheinst du hier.</>,
    name: <>Lege unter <Link to="/konto">Konto</Link> einen Anzeigenamen fest und schalte dein Profil öffentlich, um hier zu erscheinen.</>,
    private: <>Dein Profil ist nicht öffentlich. Unter <Link to="/konto">Konto</Link> kannst du es einschalten; dann erscheinst du hier mit deinem Anzeigenamen.</>,
    none: <>Du hast in dieser Rangliste noch nicht gespielt.</>,
    few: <>Noch {a.missing} {unit}, dann erscheinst du hier (ab {minFor(board)}, damit Glückssträhnen am Anfang nicht zählen).</>,
    inactive: <>Du hast länger als 30 Tage nicht gespielt und bist ausgeblendet. Eine bewertete Entscheidung reicht, um wieder zu erscheinen.</>,
  }[a.why];
  const v = boardValue(profile || {}, board);
  return <p className="notice">{text}{v && a.why !== 'none' ? ` Dein Rating hier: ${v.rating}.` : ''}</p>;
}

function Badges({ profile }) {
  const list = badgesOf(profile);
  return (
    <section className="box">
      <h3>Deine Abzeichen</h3>
      <ul className="badges">{list.map(b => <li key={b.id} className={b.earned ? 'earned' : ''} title={b.text}><b>{b.name}</b><span>{b.text}</span></li>)}</ul>
    </section>
  );
}

export default function Leaderboard() {
  const acc = useAccount();
  const [board, setBoard] = useState('overall'), [period, setPeriod] = useState('all'), [scope, setScope] = useState('all');
  const groups = useLoad(() => acc.user ? K.myGroups() : [], [acc.user?.id]);
  const isGroup = scope.startsWith('g:'), group = isGroup ? scope.slice(2) : null;
  const list = useLoad(() => K.enabled ? K.leaderboard({ board, period, scope: isGroup ? 'group' : scope, group }) : null, [board, period, scope, acc.user?.id]);

  if (!K.enabled) return <><Head /><ReferenceOnly /></>;
  const online = !!BOARDS[board].online;
  let rows = list.data || [];
  if (scope === 'all' && period === 'all' && !online) rows = withReference(rows, LEVELS);
  const range = period === 'week' ? weekOf() : period === 'month' ? monthOf() : null;
  const since = range && new Date(range.start).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  return (<>
    <Head />
    <div className="toolbar">
      <label>Rangliste <select value={board} onChange={e => setBoard(e.target.value)}>{Object.entries(BOARDS).map(([k, b]) => <option key={k} value={k}>{b.name}</option>)}</select></label>
      <label>Zeitraum <select value={period} onChange={e => setPeriod(e.target.value)}>{Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p}</option>)}</select></label>
      <label>Wer <select value={scope} onChange={e => setScope(e.target.value)} disabled={!acc.user && scope === 'all'}>
        <option value="all">Alle</option>
        {acc.user && <option value="friends">Freunde</option>}
        {(groups.data || []).map(g => <option key={g.id} value={'g:' + g.id}>Gruppe: {g.name}</option>)}
      </select></label>
    </div>
    {period !== 'all' && <p className="muted">Sortiert nach Rating-Zuwachs seit {since}. Es zählen alle, die in diesem Zeitraum gespielt haben.</p>}
    {list.error && <div className="notice" role="alert">Die Rangliste konnte nicht geladen werden: {list.error} <button className="btn" onClick={list.reload}>Erneut versuchen</button></div>}
    {list.data === undefined && !list.error && <div className="loading" role="status">Lade Rangliste …</div>}
    {list.data && <BoardTable rows={rows} board={board} gain={period !== 'all'}
      empty={scope === 'all' ? `Noch niemand mit öffentlichem Profil und mindestens ${minFor(board)} ${BOARDS[board].unit} in diesem Zeitraum.` : 'Hier hat noch niemand in dieser Rangliste gespielt.'} />}
    {scope === 'all' && acc.phase !== 'loading' && <MyStatus profile={acc.profile} board={board} />}
    {acc.profile && <Badges profile={acc.profile} />}
    <p className="notice">
      Global erscheinen nur öffentliche Profile mit mindestens {MIN_DECISIONS} Entscheidungen (online: {minFor('online_pf')} gewertete Matches), die in den letzten 30 Tagen gespielt haben.
      Bei gleichem Rating stehen mehr Entscheidungen vorn. Die Trainings-Ratings werden in deinem Browser berechnet; Online-Rating und <Link to="/rangliste/woche">Wochen-Challenge</Link> bewertet der Server.
      {scope === 'all' && period === 'all' && !online && ' Die Referenzspieler stammen aus der Kalibrierung mit simulierten Spielern.'}
    </p>
  </>);
}
