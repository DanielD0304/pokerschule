// Gruppen: anlegen, per Link einladen, Gruppenrangliste, Wochen-Challenge der Gruppe, Spot-Sets der Leitung.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as K from '../../modes/community.js';
import { loadData, hu, riverData, loadFlopSample } from '../../modes/data.js';
import { track, SPOTNAME, spotTitle } from '../../modes/progress.js';
import { BOARDS, GROUP_MAX, SET_MAX_SPOTS, weekOf } from '../../core/community.js';
import { SPOT_KEYS, makeSpot, dataNeeds, answer } from '../../core/spots.js';
import { GOOD } from '../../core/rating.js';
import { nf } from '../../modes/dom.js';
import { useAccount } from './Account.jsx';
import { CommunityTabs, BoardTable, SpotTable, SpotChoices, SpotFeedback, NeedAccount, ShareLink, useLoad, useAction, Who, fmtMs, fmtDate } from '../community.jsx';

const Head = ({ title = 'Gruppen', text = 'Lernt gemeinsam: Freundeskreis, Pokerrunde, Uni-Gruppe. Mit eigener Rangliste, Wochen-Challenge und Spot-Sets der Gruppenleitung.', back }) => (
  <div className="page-head">
    {back && <Link to={back.to} className="eyebrow">← {back.label}</Link>}
    <h1>{title}</h1>
    {text && <p>{text}</p>}
    {!back && <CommunityTabs />}
  </div>
);
const CONSENT = 'In der Gruppe sehen alle Mitglieder deinen Anzeigenamen, deine Ratings und deine Ergebnisse in der Wochen-Challenge, auch wenn dein Profil nicht öffentlich ist.';

export default function Groups() {
  const acc = useAccount();
  const [params, setParams] = useSearchParams();
  const code = params.get('einladung');
  const gate = <NeedAccount enabled={K.enabled} user={acc.user} what="Gruppen" />;
  if (!K.enabled || !acc.user) return <><Head />{gate}</>;
  if (!acc.profile?.display_name) return <><Head /><div className="notice">Lege zuerst unter <Link to="/konto">Konto</Link> einen Anzeigenamen fest. Er wird den anderen Mitgliedern angezeigt.</div></>;
  return (<>
    <Head />
    {code && <Invitation code={code} onDone={() => setParams({})} />}
    <MyGroups />
  </>);
}

function Invitation({ code, onDone }) {
  const nav = useNavigate();
  const g = useLoad(() => K.peekGroup(code), [code]);
  const [busy, error, run] = useAction();
  if (g.data === undefined) return <div className="loading" role="status" style={{ minHeight: 80 }}>Lade Einladung …</div>;
  if (!g.data) return <div className="notice" role="alert">{g.error || 'Diese Einladung ist abgelaufen. Bitte die Gruppenleitung um einen neuen Link.'} <button className="btn" onClick={onDone}>Schließen</button></div>;
  if (g.data.member) return <div className="notice">Du bist schon in „{g.data.name}“. <Link to={`/rangliste/gruppen/${g.data.id}`}>Zur Gruppe</Link></div>;
  return (
    <section className="box invite-box">
      <h3>{g.data.lead ? `${g.data.lead} lädt dich in „${g.data.name}“ ein` : `Einladung in „${g.data.name}“`}</h3>
      <p>{g.data.members} von {GROUP_MAX} Mitgliedern.</p>
      <p className="muted">{CONSENT} Du kannst die Gruppe jederzeit verlassen.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" autoFocus disabled={busy} onClick={async () => { const id = await run(() => K.joinGroup(code)); if (id) nav(`/rangliste/gruppen/${id}`); }}>Beitreten</button>
        <button className="btn" onClick={onDone}>Ablehnen</button>
      </div>
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  );
}

function MyGroups() {
  const nav = useNavigate();
  const list = useLoad(K.myGroups, []);
  const [name, setName] = useState('');
  const [busy, error, run] = useAction();
  const create = async e => {
    e.preventDefault();
    const id = await run(() => K.createGroup(name.trim()));
    if (id) nav(`/rangliste/gruppen/${id}`);
  };
  return (<>
    {list.error && <div className="notice" role="alert">{list.error}</div>}
    {list.data?.length > 0 && (
      <div className="grid3">{list.data.map(g => (
        <Link key={g.id} to={`/rangliste/gruppen/${g.id}`} className="tile">
          <h3>{g.name}</h3>
          <p>{g.members} {g.members === 1 ? 'Mitglied' : 'Mitglieder'}</p>
          <div className="tile-meta">{g.role === 'lead' && <span className="chip">Leitung</span>}</div>
        </Link>
      ))}</div>
    )}
    {list.data && !list.data.length && <p className="notice">Du bist noch in keiner Gruppe. Leg eine an und schick den Einladungslink weiter, oder öffne einen Link, den du bekommen hast.</p>}
    <section className="box">
      <h3>Neue Gruppe</h3>
      <form onSubmit={create} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '1 1 260px' }}>Name der Gruppe
          <input value={name} maxLength={40} onChange={e => setName(e.target.value)} placeholder="z. B. Donnerstagsrunde" />
          <span className="hint">3–40 Zeichen. Du wirst Gruppenleitung und kannst bis zu {GROUP_MAX} Mitglieder einladen.</span>
        </label>
        <button className="btn primary" disabled={busy || name.trim().length < 3}>Gruppe anlegen</button>
      </form>
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  </>);
}

// ---------- Eine Gruppe ----------

const SECTIONS = [['board', 'Rangliste'], ['week', 'Wochen-Challenge'], ['sets', 'Spot-Sets'], ['members', 'Mitglieder']];

export function GroupPage() {
  const { id } = useParams();
  const acc = useAccount();
  const info = useLoad(() => acc.user ? K.groupInfo(id) : null, [id, acc.user?.id]);
  const [tab, setTab] = useState('board');
  const back = { to: '/rangliste/gruppen', label: 'Gruppen' };
  if (!K.enabled || !acc.user) return <><Head title="Gruppe" text="" back={back} /><NeedAccount enabled={K.enabled} user={acc.user} what="Gruppen" /></>;
  if (info.error) return <><Head title="Gruppe" text="" back={back} /><div className="notice" role="alert">{info.error}</div></>;
  if (!info.data) return <><Head title="Gruppe" text="" back={back} /><div className="loading" role="status">Lade Gruppe …</div></>;
  const g = info.data, lead = g.role === 'lead';
  return (<>
    <Head title={g.name} text={`${g.members.length} von ${GROUP_MAX} Mitgliedern${lead ? ' · du leitest die Gruppe' : ''}`} back={back} />
    <div className="segmented" role="tablist" aria-label="Bereiche der Gruppe">
      {SECTIONS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>)}
    </div>
    {tab === 'board' && <GroupBoard id={id} />}
    {tab === 'week' && <GroupWeek id={id} />}
    {tab === 'sets' && <Sets g={g} lead={lead} reload={info.reload} />}
    {tab === 'members' && <Members g={g} lead={lead} reload={info.reload} />}
  </>);
}

function GroupBoard({ id }) {
  const [board, setBoard] = useState('overall'), [period, setPeriod] = useState('all');
  const list = useLoad(() => K.leaderboard({ board, period, scope: 'group', group: id }), [id, board, period]);
  return (<>
    <div className="toolbar">
      <label>Rangliste <select value={board} onChange={e => setBoard(e.target.value)}>{Object.entries(BOARDS).map(([k, b]) => <option key={k} value={k}>{b.name}</option>)}</select></label>
      <label>Zeitraum <select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Gesamt</option><option value="week">Diese Woche</option><option value="month">Dieser Monat</option></select></label>
    </div>
    {list.error && <p className="form-msg bad" role="alert">{list.error}</p>}
    {list.data && <BoardTable rows={list.data} board={board} gain={period !== 'all'} empty="In dieser Rangliste hat noch kein Mitglied gespielt." />}
    <p className="muted" style={{ fontSize: '.85rem' }}>In der Gruppe zählen alle Mitglieder, auch mit wenigen Entscheidungen; die Zahl daneben zeigt, wie belastbar ein Rating ist.</p>
  </>);
}

function GroupWeek({ id }) {
  const week = weekOf().key;
  const b = useLoad(() => K.weeklyBoard({ week, scope: 'group', group: id }), [id]);
  return (
    <section className="box">
      <h3>Wochen-Challenge dieser Woche</h3>
      <p className="muted">Alle spielen dieselben 20 Spots. <Link to="/rangliste/woche">Selbst mitspielen</Link></p>
      {b.error && <p className="form-msg bad" role="alert">{b.error}</p>}
      {b.data && !b.data.length && <p className="muted">Aus der Gruppe hat noch niemand abgegeben.</p>}
      {b.data?.length > 0 && (
        <table className="board"><thead><tr><th>#</th><th>Spieler</th><th style={{ textAlign: 'right' }}>EV-Verlust</th><th style={{ textAlign: 'right' }}>Zeit</th></tr></thead>
          <tbody>{b.data.map(r => <tr key={r.pos} className={r.me ? 'you' : ''}><td className="num" style={{ textAlign: 'left' }}>{r.pos}</td><td><Who name={r.name} avatar={r.avatar} isPublic={r.is_public} /></td><td className="num">{nf(r.loss)} BB</td><td className="num">{fmtMs(r.ms)}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

// ---------- Spot-Sets ----------

const KIND_NAME = { duel: 'Preflop-Duell', flop: 'Flop', river: 'River' };

function Sets({ g, lead, reload }) {
  const [busy, error, run] = useAction();
  return (<>
    {!g.sets.length && <p className="notice">{lead ? 'Noch keine Spot-Sets. Stell unten Situationen zusammen, die deine Gruppe gezielt üben soll.' : 'Die Gruppenleitung hat noch keine Spot-Sets geteilt.'}</p>}
    {g.sets.map(s => {
      const mine = s.progress.find(p => p.me);
      return (
        <section key={s.id} className="box">
          <div className="panel-title"><h3>{s.name}</h3><span className="muted" style={{ fontSize: '.85rem' }}>{s.spots.length} {s.spots.length === 1 ? 'Situation' : 'Situationen'}</span></div>
          {s.note && <p>{s.note}</p>}
          <p className="muted" style={{ fontSize: '.88rem' }}>{s.spots.map(k => spotTitle(k)).join(' · ')}</p>
          {s.progress.length > 0 && (
            <details><summary>Übungsstand der Mitglieder</summary>
              <table className="board"><thead><tr><th>Spieler</th><th style={{ textAlign: 'right' }}>Spots</th><th style={{ textAlign: 'right' }}>Daneben</th><th style={{ textAlign: 'right' }}>EV-Verlust ø</th></tr></thead>
                <tbody>{s.progress.map(p => <tr key={p.name} className={p.me ? 'you' : ''}><td>{p.name}</td><td className="num">{p.n}</td><td className="num">{Math.round(p.wrong / p.n * 100)} %</td><td className="num">{nf(p.loss / p.n)} BB</td></tr>)}</tbody>
              </table>
            </details>
          )}
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <Link className="btn primary" to={`/rangliste/gruppen/${g.id}/set/${s.id}`}>{mine ? 'Weiter üben' : 'Üben'}</Link>
            {lead && <button className="btn" disabled={busy} onClick={async () => { if (confirm(`Spot-Set „${s.name}“ löschen?`)) { await run(() => K.deleteSet(s.id)); reload(); } }}>Löschen</button>}
          </div>
        </section>
      );
    })}
    {error && <p className="form-msg bad" role="alert">{error}</p>}
    {lead && <NewSet g={g} reload={reload} />}
  </>);
}

function NewSet({ g, reload }) {
  const [name, setName] = useState(''), [note, setNote] = useState(''), [picked, setPicked] = useState([]);
  const [busy, error, run, setError] = useAction();
  const toggle = k => setPicked(p => p.includes(k) ? p.filter(x => x !== k) : p.length >= SET_MAX_SPOTS ? p : [...p, k]);
  const save = async e => {
    e.preventDefault();
    if (name.trim().length < 3) { setError('Der Name braucht mindestens 3 Zeichen.'); return; }
    if (!picked.length) { setError('Wähle mindestens eine Situation.'); return; }
    const id = await run(() => K.saveSet(g.id, name.trim(), picked, note));
    if (id) { setName(''); setNote(''); setPicked([]); reload(); }
  };
  return (
    <section className="box">
      <h3>Neues Spot-Set</h3>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">Name<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="z. B. Bluff-Catching am River" /></label>
        <label className="field" style={{ maxWidth: 560 }}>Hinweis für die Gruppe (optional)<textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
        {Object.entries(KIND_NAME).map(([kind, label]) => (
          <fieldset key={kind} className="spot-pick">
            <legend>{label}</legend>
            {SPOT_KEYS.filter(k => k.startsWith(kind + ':')).map(k => (
              <label key={k} className="check"><input type="checkbox" checked={picked.includes(k)} onChange={() => toggle(k)} disabled={!picked.includes(k) && picked.length >= SET_MAX_SPOTS} /><span>{SPOTNAME[k]?.[1] || k}</span></label>
            ))}
          </fieldset>
        ))}
        <p className="muted" style={{ fontSize: '.85rem' }}>{picked.length} von höchstens {SET_MAX_SPOTS} gewählt. Die Mitglieder bekommen zufällige Hände aus diesen Situationen.</p>
        <div><button className="btn primary" disabled={busy}>Spot-Set teilen</button></div>
        {error && <p className="form-msg bad" role="alert">{error}</p>}
      </form>
    </section>
  );
}

/** Üben eines Spot-Sets: zufällige Hände aus den gewählten Situationen, Analyse nach jeder Antwort. Ändert kein Rating. */
export function SetTrainer() {
  const { id, set } = useParams();
  const acc = useAccount();
  const info = useLoad(() => acc.user ? K.groupInfo(id) : null, [id, acc.user?.id]);
  const s = info.data?.sets.find(x => x.id === set);
  const [flops, setFlops] = useState(null), [ready, setReady] = useState(false), [loadErr, setLoadErr] = useState(null);
  const [spot, setSpot] = useState(null), [choice, setChoice] = useState(null), [tally, setTally] = useState({ n: 0, good: 0, loss: 0 });
  const [saveErr, setSaveErr] = useState(null);
  useEffect(() => {
    if (!s) return;
    let alive = true;
    // Flop: Index plus acht Boards nach Häufigkeit (statt aller 60), das reicht für Abwechslung
    loadData(dataNeeds(s.spots))
      .then(() => dataNeeds(s.spots).includes('flop') ? loadFlopSample(8) : null)
      .then(f => { if (alive) { setFlops(f); setReady(true); } }, e => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, [s?.id]);
  const ctx = useMemo(() => {
    if (!ready) return null;
    const need = dataNeeds(s.spots);
    return { HU: need.includes('huTree') ? hu() : null, flop: flops, river: need.includes('river') ? riverData() : null };
  }, [ready]);
  const next = () => {
    setChoice(null);
    for (let i = 0; i < 20; i++) { const x = makeSpot(ctx, s.spots[Math.floor(Math.random() * s.spots.length)]); if (x) { setSpot(x); return; } }
  };
  useEffect(() => { if (ctx) next(); }, [ctx]);
  const pick = k => {
    const r = answer(spot, k);
    setChoice(k);
    setTally(t => ({ n: t.n + 1, good: t.good + (GOOD.has(r.q) ? 1 : 0), loss: t.loss + r.loss }));
    track(spot.kind, spot.node, r.q, r.loss); // Situations-Statistik, ohne Rating
    K.recordSet(set, { n: 1, wrong: GOOD.has(r.q) ? 0 : 1, loss: r.loss }).then(() => setSaveErr(null), e => setSaveErr(e.message));
  };
  const back = { to: `/rangliste/gruppen/${id}`, label: info.data?.name || 'Gruppe' };
  if (!K.enabled || !acc.user) return <><Head title="Spot-Set" text="" back={back} /><NeedAccount enabled={K.enabled} user={acc.user} what="Spot-Sets" /></>;
  if (info.error || (info.data && !s)) return <><Head title="Spot-Set" text="" back={back} /><div className="notice" role="alert">{info.error || 'Dieses Spot-Set gibt es nicht mehr.'}</div></>;
  return (<>
    <Head title={s?.name || 'Spot-Set'} text={s?.note || 'Situationen, die die Gruppenleitung zum Üben ausgewählt hat. Dein Rating ändert sich hier nicht.'} back={back} />
    {loadErr && <div className="notice" role="alert">{loadErr}</div>}
    {!spot && !loadErr && <div className="loading" role="status">Lade Solver-Daten …</div>}
    {spot && (
      <div className="game">
        <div className="game-main">
          <div className="matchbar"><span>{spotTitle(spot.key)}</span><span>Geübt <b>{tally.n}</b></span>{tally.n > 0 && <span>Richtig <b>{tally.good}</b> · ø <b>{nf(tally.loss / tally.n)} BB</b> Verlust</span>}</div>
          <SpotTable spot={spot} />
          {choice === null ? <SpotChoices spot={spot} onPick={pick} /> : <div className="actions"><button className="btn primary" autoFocus onClick={next}>Nächster Spot</button></div>}
          {saveErr && <p className="form-msg bad" role="alert">Übungsstand nicht gespeichert: {saveErr}</p>}
        </div>
        <aside className="game-side">
          {choice !== null ? <SpotFeedback spot={spot} choice={choice} /> : <section className="box"><h3>So geht’s</h3><p className="muted">Entscheide, dann siehst du die EVs aller Optionen und wie das Gleichgewicht deine Hand spielt. Die Gruppe sieht deinen Übungsstand.</p></section>}
        </aside>
      </div>
    )}
  </>);
}

// ---------- Mitglieder und Verwaltung ----------

function Members({ g, lead, reload }) {
  const nav = useNavigate();
  const [busy, error, run] = useAction();
  const [invite, setInvite] = useState(null), [name, setName] = useState(g.name), [confirmDel, setConfirmDel] = useState(false);
  const loadInvite = async renew => { const i = await run(() => K.groupInvite(g.id, renew)); if (i) setInvite(i); };
  useEffect(() => { if (lead) loadInvite(false); }, [lead]);
  const leave = async () => {
    const last = g.members.length === 1;
    if (!confirm(last ? 'Du bist das letzte Mitglied. Verlassen löscht die Gruppe. Fortfahren?' : 'Gruppe wirklich verlassen?')) return;
    if (await run(() => K.leaveGroup(g.id).then(() => true))) nav('/rangliste/gruppen');
  };
  return (<>
    {lead && (
      <section className="box">
        <h3>Mitglieder einladen</h3>
        {invite ? (<>
          <p>Wer diesen Link öffnet, kann der Gruppe beitreten. Er gilt bis {fmtDate(invite.expires_at)}.</p>
          <ShareLink url={K.inviteUrl('/rangliste/gruppen', invite.code)} text={`Tritt meiner Gruppe „${g.name}“ in der Pokerschule bei`} label="Einladungslink" />
          <div><button className="reset" disabled={busy} onClick={() => loadInvite(true)}>Neuen Link erzeugen (der alte gilt dann nicht mehr)</button></div>
        </>) : <p className="muted">Lade Link …</p>}
      </section>
    )}
    <section className="box">
      <h3>Mitglieder ({g.members.length} von {GROUP_MAX})</h3>
      <div className="log">{g.members.map(m => (
        <div className="lr member-row" key={m.id}>
          <Who name={m.name} avatar={m.avatar} isPublic={m.is_public} />
          <span className="muted">{m.role === 'lead' ? 'Leitung' : 'Mitglied'}{m.me ? ' · du' : ''}</span>
          <span className="muted hide-sm">seit {new Date(m.joined_at).toLocaleDateString('de-DE')}</span>
          <span className="row" style={{ justifyContent: 'flex-end' }}>{lead && !m.me && (<>
            {m.role !== 'lead' && <button className="reset" disabled={busy} onClick={async () => { if (confirm(`${m.name} ebenfalls zur Gruppenleitung machen?`)) { await run(() => K.promoteMember(g.id, m.id)); reload(); } }}>Zur Leitung</button>}
            <button className="reset" disabled={busy} onClick={async () => { if (confirm(`${m.name} aus der Gruppe entfernen?`)) { await run(() => K.kickMember(g.id, m.id)); reload(); } }}>Entfernen</button>
          </>)}</span>
        </div>
      ))}</div>
    </section>
    {lead && (
      <section className="box">
        <h3>Gruppe verwalten</h3>
        <form onSubmit={async e => { e.preventDefault(); await run(() => K.renameGroup(g.id, name.trim())); reload(); }} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '1 1 260px' }}>Name<input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
          <button className="btn" disabled={busy || name.trim().length < 3 || name.trim() === g.name}>Umbenennen</button>
        </form>
        {!confirmDel ? <div><button className="btn" onClick={() => setConfirmDel(true)}>Gruppe löschen …</button></div>
          : <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn primary" style={{ background: 'var(--bad)' }} disabled={busy} onClick={async () => { if (await run(() => K.deleteGroup(g.id).then(() => true))) nav('/rangliste/gruppen'); }}>Ja, Gruppe mit allen Spot-Sets löschen</button>
              <button className="btn" autoFocus onClick={() => setConfirmDel(false)}>Abbrechen</button>
            </div>}
      </section>
    )}
    <section className="box">
      <h3>Gruppe verlassen</h3>
      <p className="muted">{lead && g.members.length > 1 ? 'Wenn du gehst und niemand sonst die Gruppe leitet, übernimmt das Mitglied, das am längsten dabei ist.' : 'Du kannst über einen neuen Einladungslink wieder beitreten.'}</p>
      <div><button className="btn" disabled={busy} onClick={leave}>Gruppe verlassen</button></div>
    </section>
    {error && <p className="form-msg bad" role="alert">{error}</p>}
  </>);
}
