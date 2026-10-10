// Freunde: persönlicher Link, Anfragen an öffentliche Profile, Vergleich „du gegen Freund“ je Situation.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as K from '../../modes/community.js';
import { spotTitle } from '../../modes/progress.js';
import { compareSpots } from '../../core/community.js';
import { nf } from '../../modes/dom.js';
import { useAccount } from './Account.jsx';
import { CommunityTabs, NeedAccount, ShareLink, useLoad, useAction, Who } from '../community.jsx';

const Head = () => (
  <div className="page-head">
    <h1>Freunde</h1>
    <p>Vergleiche dich mit Leuten, die du kennst: Ratings, Wochen-Challenge und Situation für Situation, wer weniger EV verliert.</p>
    <CommunityTabs />
  </div>
);
const CONSENT = 'Freunde sehen gegenseitig Anzeigenamen, Ratings, Ergebnisse der Wochen-Challenge und den Vergleich je Situation, auch ohne öffentliches Profil.';

export default function Friends() {
  const acc = useAccount();
  const [params, setParams] = useSearchParams();
  const code = params.get('einladung');
  const list = useLoad(() => acc.user ? K.friends() : [], [acc.user?.id]);
  const [compare, setCompare] = useState(null);
  if (!K.enabled || !acc.user) return <><Head /><NeedAccount enabled={K.enabled} user={acc.user} what="Freunde" /></>;
  if (!acc.profile?.display_name) return <><Head /><div className="notice">Lege zuerst unter <Link to="/konto">Konto</Link> einen Anzeigenamen fest. Ihn sehen deine Freunde.</div></>;
  const all = list.data || [];
  const accepted = all.filter(f => f.status === 'accepted'), incoming = all.filter(f => f.status === 'pending' && f.incoming), outgoing = all.filter(f => f.status === 'pending' && !f.incoming);
  return (<>
    <Head />
    {code && <LinkInvitation code={code} onDone={() => { setParams({}); list.reload(); }} />}
    {list.error && <div className="notice" role="alert">{list.error}</div>}
    {incoming.length > 0 && <Requests list={incoming} reload={list.reload} />}
    <section className="box">
      <h3>Deine Freunde{accepted.length ? ` (${accepted.length})` : ''}</h3>
      {list.data && !accepted.length && <p className="muted">Noch keine Freunde. Schick deinen Freundes-Link weiter oder frag jemanden aus der Rangliste an.</p>}
      <div className="log">{accepted.map(f => (
        <div className="lr member-row" key={f.id}>
          <Who name={f.name} avatar={f.avatar} isPublic={f.is_public} />
          <span className="muted">Rating {f.rating ?? '–'}</span>
          <span className="muted hide-sm">{f.online?.pf ? `Online P/F ${f.online.pf.rating}` : ''}</span>
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" aria-pressed={compare?.id === f.id} onClick={() => setCompare(compare?.id === f.id ? null : f)}>Vergleichen</button>
            <RemoveButton f={f} reload={list.reload} />
          </span>
        </div>
      ))}</div>
    </section>
    {compare && <Compare friend={compare} />}
    <MyLink />
    <Request reload={list.reload} />
    {outgoing.length > 0 && (
      <section className="box">
        <h3>Gesendete Anfragen</h3>
        <div className="log">{outgoing.map(f => <div className="lr member-row" key={f.id}><Who name={f.name} avatar={f.avatar} isPublic={f.is_public} /><span className="muted">wartet</span><span /><span className="row" style={{ justifyContent: 'flex-end' }}><RemoveButton f={f} reload={list.reload} label="Zurückziehen" /></span></div>)}</div>
      </section>
    )}
    <p className="notice">{CONSENT} Die Rangliste unter Freunden findest du unter <Link to="/rangliste">Rangliste</Link> → „Wer: Freunde“.</p>
  </>);
}

function RemoveButton({ f, reload, label = 'Entfernen' }) {
  const [busy, , run] = useAction();
  return <button className="reset" disabled={busy} onClick={async () => { if (label !== 'Entfernen' || confirm(`${f.name} aus deinen Freunden entfernen?`)) { await run(() => K.removeFriend(f.id)); reload(); } }}>{label}</button>;
}

function Requests({ list, reload }) {
  const [busy, error, run] = useAction();
  const respond = async (f, yes) => { await run(() => K.respondFriend(f.id, yes)); reload(); };
  return (
    <section className="box invite-box">
      <h3>Freundschaftsanfragen</h3>
      <p className="muted">{CONSENT}</p>
      <div className="log">{list.map(f => (
        <div className="lr member-row" key={f.id}>
          <Who name={f.name} avatar={f.avatar} isPublic={f.is_public} /><span /><span className="hide-sm" />
          <span className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={busy} onClick={() => respond(f, true)}>Annehmen</button>
            <button className="btn" disabled={busy} onClick={() => respond(f, false)}>Ablehnen</button>
          </span>
        </div>
      ))}</div>
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  );
}

function LinkInvitation({ code, onDone }) {
  const p = useLoad(() => K.peekFriendLink(code), [code]);
  const [busy, error, run] = useAction();
  const [done, setDone] = useState(null);
  if (p.data === undefined) return <div className="loading" role="status" style={{ minHeight: 80 }}>Lade Einladung …</div>;
  if (!p.data) return <div className="notice" role="alert">Dieser Freundes-Link gilt nicht mehr. <button className="btn" onClick={onDone}>Schließen</button></div>;
  if (p.data.own) return <div className="notice">Das ist dein eigener Freundes-Link. Schick ihn an jemand anderen. <button className="btn" onClick={onDone}>Schließen</button></div>;
  if (done) return <div className="notice" role="status">Du und {done} seid jetzt befreundet. <button className="btn" onClick={onDone}>OK</button></div>;
  return (
    <section className="box invite-box">
      <h3>{p.data.name} möchte mit dir befreundet sein</h3>
      <p className="muted">{CONSENT}</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" autoFocus disabled={busy} onClick={async () => { const n = await run(() => K.acceptFriendLink(code)); if (n) setDone(n); }}>Annehmen</button>
        <button className="btn" onClick={onDone}>Ablehnen</button>
      </div>
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  );
}

function MyLink() {
  const [code, setCode] = useState(null);
  const [busy, error, run] = useAction();
  const load = async renew => { const c = await run(() => K.friendLink(renew)); if (c) setCode(c); };
  return (
    <section className="box">
      <h3>Dein Freundes-Link</h3>
      <p className="muted">Wer diesen Link öffnet und annimmt, ist sofort mit dir befreundet. Teile ihn nur mit Leuten, die du kennst.</p>
      {code ? (<>
        <ShareLink url={K.inviteUrl('/rangliste/freunde', code)} text="Lass uns in der Pokerschule vergleichen, wer besser entscheidet" />
        <div><button className="reset" disabled={busy} onClick={() => load(true)}>Neuen Link erzeugen (der alte gilt dann nicht mehr)</button></div>
      </>) : <div><button className="btn" disabled={busy} onClick={() => load(false)}>Link anzeigen</button></div>}
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  );
}

function Request({ reload }) {
  const [name, setName] = useState(''), [sent, setSent] = useState(null);
  const [busy, error, run] = useAction();
  const submit = async e => {
    e.preventDefault();
    const n = name.trim();
    if ((await run(() => K.requestFriend(n).then(() => true))) === true) { setSent(n); setName(''); reload(); }
  };
  return (
    <section className="box">
      <h3>Anfrage per Anzeigename</h3>
      <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '1 1 220px' }}>Anzeigename<input value={name} maxLength={24} onChange={e => setName(e.target.value)} />
          <span className="hint">Nur Profile, die öffentlich sind. Alle anderen erreichst du über deinen Link.</span></label>
        <button className="btn" disabled={busy || name.trim().length < 3}>Anfrage senden</button>
      </form>
      {sent && <p className="form-msg" role="status">Anfrage an {sent} gesendet.</p>}
      {error && <p className="form-msg bad" role="alert">{error}</p>}
    </section>
  );
}

function Compare({ friend }) {
  const c = useLoad(() => K.compareWith(friend.id).then(rows => compareSpots(rows)), [friend.id]);
  const rows = c.data || [];
  const lead = rows.filter(r => r.better === 'me').length, behind = rows.filter(r => r.better === 'them').length;
  return (
    <section className="box">
      <h3>Du gegen {friend.name}</h3>
      {c.error && <p className="form-msg bad" role="alert">{c.error}</p>}
      {c.data === undefined && !c.error && <p className="muted">Lade Vergleich …</p>}
      {c.data && !rows.length && <p className="muted">Noch keine gemeinsamen Daten. Verglichen wird, was ihr seit der Anmeldung gespielt habt.</p>}
      {rows.length > 0 && (<>
        <p>{lead || behind ? <>In <b>{lead}</b> {lead === 1 ? 'Situation' : 'Situationen'} verlierst du weniger EV, in <b>{behind}</b> {friend.name}.</> : 'Noch keine Situation mit genug Entscheidungen von euch beiden.'}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="board">
            <thead><tr><th>Situation</th><th style={{ textAlign: 'right' }}>Du ø</th><th style={{ textAlign: 'right' }}>{friend.name} ø</th><th>Vorne</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.spot} className={r.enough ? '' : 'muted'}>
                <td>{spotTitle(r.spot)}</td>
                <td className="num">{r.mine == null ? '–' : `${nf(r.mine)} BB`} <small className="muted">({r.myN})</small></td>
                <td className="num">{r.theirs == null ? '–' : `${nf(r.theirs)} BB`} <small className="muted">({r.theirN})</small></td>
                <td>{r.better === 'me' ? <span className="up">Du</span> : r.better === 'them' ? <span className="down">{friend.name}</span> : <span className="muted">{r.enough ? 'gleichauf' : 'zu wenig Daten'}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: '.85rem' }}>Durchschnittlicher EV-Verlust je Entscheidung, in Klammern die Zahl der Entscheidungen. Verglichen wird ab 5 Entscheidungen von euch beiden.</p>
      </>)}
    </section>
  );
}
