import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as A from '../../modes/account.js';
import { nameError } from '../../core/sync.js';
import { MODES, levelOf } from '../../modes/insights.js';

export const useAccount = () => useSyncExternalStore(A.subscribe, A.getStatus);

export const AVATARS = { spade: '♠', heart: '♥', diamond: '♦', club: '♣', chip: '◎', crown: '♛' };
const PROVIDER = { google: 'Google', apple: 'Apple' };
const n = (x, one, many) => `${x === 1 ? 'eine' : x} ${x === 1 ? one : many}`;
const errText = A.errorText;

/** Kurzer Status für Seitenleiste und Kopfzeile. */
export function syncLabel(s) {
  if (s.phase === 'synced') return ['ok', 'Gesichert'];
  if (s.phase === 'syncing' || s.phase === 'loading') return ['busy', 'Wird gesichert …'];
  if (s.phase === 'offline') return ['busy', 'Offline, wird nachgeholt'];
  if (s.phase === 'error') return ['bad', 'Sicherung fehlgeschlagen'];
  if (s.phase === 'link') return ['busy', 'Bitte bestätigen'];
  return ['', ''];
}

function SignIn({ s }) {
  const [email, setEmail] = useState(s.sent || ''), [age, setAge] = useState(false), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg([ok, '']); } catch (e) { setMsg([errText(e), 'bad']); }
    setBusy(false);
  };
  const submit = e => {
    e.preventDefault();
    if (!age) { setMsg(['Bitte bestätige, dass du mindestens 18 Jahre alt bist.', 'bad']); return; }
    run(() => A.sendLink(email.trim()));
  };
  return (
    <section className="box">
      <h3>Anmelden oder Konto anlegen</h3>
      <p className="muted">Ohne Passwort: Du bekommst einen Link per E-Mail. Ein Konto ist freiwillig; ohne Konto funktioniert alles wie bisher.</p>
      {!s.sent ? (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">E-Mail-Adresse
            <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="check"><input type="checkbox" checked={age} onChange={e => setAge(e.target.checked)} />
            <span>Ich bin mindestens 18 Jahre alt und habe die <Link to="/datenschutz">Datenschutzerklärung</Link> gelesen.</span></label>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy}>Link senden</button>
            {A.providers.map(p => <button key={p} type="button" className="btn" disabled={busy} onClick={() => age ? run(() => A.signInWith(p)) : setMsg(['Bitte bestätige, dass du mindestens 18 Jahre alt bist.', 'bad'])}>Mit {PROVIDER[p]} anmelden</button>)}
          </div>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); run(() => A.verifyCode(s.sent, code)); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p>Wir haben einen Link an <b>{s.sent}</b> geschickt. Öffne ihn, und du bist angemeldet. Schau auch im Spam-Ordner nach.</p>
          <label className="field">Oder den Code aus der E-Mail eingeben
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" value={code} onChange={e => setCode(e.target.value)} />
          </label>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy || code.trim().length < 6}>Code bestätigen</button>
            <button type="button" className="btn" onClick={() => run(() => A.sendLink(s.sent), 'Ein neuer Link ist unterwegs.')} disabled={busy}>Erneut senden</button>
          </div>
        </form>
      )}
      {msg && <p className={'form-msg ' + msg[1]} role={msg[1] ? 'alert' : 'status'}>{msg[0]}</p>}
    </section>
  );
}

function LinkPrompt({ link }) {
  const { local, remote } = link;
  return (
    <section className="box" style={{ borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
      <h3>Fortschritt mit deinem Konto verbinden?</h3>
      <p>Du hast in diesem Browser {n(local.decisions, 'Entscheidung', 'Entscheidungen')} und {n(local.mistakes, 'offenen Fehler', 'offene Fehler')}.
        {remote ? ` In deinem Konto sind ${n(remote.decisions, 'Entscheidung', 'Entscheidungen')} und ${n(remote.mistakes, 'offener Fehler', 'offene Fehler')} gespeichert.` : ' Dein Konto ist noch leer.'}</p>
      <p className="muted">Beim Zusammenführen gewinnt pro Bereich der Stand mit mehr Entscheidungen; Fehlerlisten werden vereinigt. Vorher legen wir in diesem Browser automatisch eine Sicherung an.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" autoFocus onClick={() => A.connect('merge')}>{remote ? 'Zusammenführen' : 'Verbinden'}</button>
        {remote && <button className="btn" onClick={() => A.connect('remote')}>Nur Stand des Kontos verwenden</button>}
        <button className="btn" onClick={() => A.cancelLink()}>Abbrechen und abmelden</button>
      </div>
    </section>
  );
}

function Profile({ s }) {
  const p = s.profile || {};
  const [name, setName] = useState(p.display_name || ''), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const save = async patch => {
    setBusy(true); setMsg(null);
    try { await A.updateProfile(patch); setMsg(['Gespeichert.', '']); } catch (e) { setMsg([errText(e), 'bad']); }
    setBusy(false);
  };
  const submitName = e => {
    e.preventDefault();
    const err = nameError(name); if (err) { setMsg([err, 'bad']); return; }
    save({ display_name: name.trim() });
  };
  return (
    <section className="box">
      <h3>Profil</h3>
      <form onSubmit={submitName} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ flex: '1 1 220px' }}>Anzeigename
          <input value={name} maxLength={24} autoComplete="nickname" onChange={e => setName(e.target.value)} />
          <span className="hint">3–24 Zeichen, kein Klarname nötig.</span>
        </label>
        <button className="btn" disabled={busy || name.trim() === (p.display_name || '')}>Speichern</button>
      </form>
      <div className="field">Avatar
        <div className="avatars" role="group" aria-label="Avatar wählen">
          {Object.entries(AVATARS).map(([k, sym]) => <button key={k} type="button" aria-pressed={p.avatar === k} aria-label={k} disabled={busy} onClick={() => save({ avatar: p.avatar === k ? null : k })}>{sym}</button>)}
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={!!p.is_public} disabled={busy || !p.display_name} onChange={e => save({ is_public: e.target.checked })} />
        <span>Öffentliches Profil: Anzeigename, Ratings und „Mitglied seit“ sind für alle sichtbar.{!p.display_name && ' Dafür brauchst du zuerst einen Anzeigenamen.'}
          {p.is_public && p.display_name && <> Adresse: <Link to={`/spieler/${encodeURIComponent(p.display_name)}`}>/spieler/{p.display_name}</Link></>}</span></label>
      {msg && <p className={'form-msg ' + msg[1]} role={msg[1] ? 'alert' : 'status'}>{msg[0]}</p>}
    </section>
  );
}

function Danger() {
  const [step, setStep] = useState(0), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [wipe, setWipe] = useState(false);
  const run = async fn => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg(errText(e)); } setBusy(false); };
  return (<>
    <section className="box">
      <h3>Daten exportieren</h3>
      <p className="muted">Lädt alles, was zu deinem Konto gespeichert ist (Profil, Fortschritt, jede Entscheidung), als JSON-Datei herunter.</p>
      <div><button className="btn" disabled={busy} onClick={() => run(A.exportAccount)}>Kontodaten herunterladen</button></div>
    </section>
    <section className="box">
      <h3>Abmelden</h3>
      <label className="check"><input type="checkbox" checked={wipe} onChange={e => setWipe(e.target.checked)} /><span>Fortschritt auch aus diesem Browser entfernen (für geteilte Geräte). Im Konto bleibt er erhalten.</span></label>
      <div><button className="btn" disabled={busy} onClick={() => run(() => A.signOut({ wipe }))}>Abmelden</button></div>
    </section>
    <section className="box">
      <h3>Konto löschen</h3>
      <p className="muted">Löscht dein Konto und alle Daten auf dem Server sofort und endgültig. Sicherungskopien des Anbieters laufen nach spätestens 30 Tagen aus. Der Fortschritt in diesem Browser bleibt erhalten.</p>
      {step === 0
        ? <div><button className="btn" onClick={() => setStep(1)}>Konto löschen …</button></div>
        : <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" style={{ background: 'var(--bad)' }} disabled={busy} onClick={() => run(A.deleteAccount)}>Ja, Konto endgültig löschen</button>
            <button className="btn" autoFocus onClick={() => setStep(0)}>Abbrechen</button>
          </div>}
    </section>
    {msg && <p className="form-msg bad" role="alert">{msg}</p>}
  </>);
}

function Backup() {
  const [info, setInfo] = useState(A.backupInfo()), [confirm, setConfirm] = useState(false);
  if (!info) return null;
  return (
    <section className="box">
      <h3>Sicherung vom Verbinden</h3>
      <p className="muted">Vor dem ersten Verbinden am {new Date(info.at).toLocaleString('de-DE')} wurde dieser Browser-Stand gesichert: {n(info.decisions, 'Entscheidung', 'Entscheidungen')}, {n(info.mistakes, 'offener Fehler', 'offene Fehler')}.</p>
      {!confirm ? <div><button className="btn" onClick={() => setConfirm(true)}>Sicherung wiederherstellen …</button></div>
        : <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" onClick={() => { A.restoreBackup(); setConfirm(false); setInfo(A.backupInfo()); }}>Ersetzt den aktuellen Stand, auch im Konto</button>
            <button className="btn" autoFocus onClick={() => setConfirm(false)}>Abbrechen</button>
          </div>}
    </section>
  );
}

export default function Account() {
  const s = useAccount();
  useEffect(() => { A.ensureClient(); }, []);
  const head = <div className="page-head"><h1>Konto</h1><p>Dein Fortschritt auf allen Geräten: Handy unterwegs, Laptop zu Hause, ein Rating und eine Fehlerliste.</p></div>;
  if (!A.enabled) return <>{head}<div className="notice">Konten sind auf dieser Installation nicht eingerichtet. Dein Fortschritt liegt in diesem Browser; unter <Link to="/statistik">Statistik</Link> kannst du ihn als Datei sichern.</div></>;
  const [cls, label] = syncLabel(s);
  return (<>
    {head}
    {s.phase === 'error' && <div className="notice" role="alert">{s.error} <button className="btn" onClick={() => A.syncNow()}>Erneut versuchen</button></div>}
    {!s.user && ['idle', 'error', 'offline'].includes(s.phase) && <SignIn s={s} />}
    {s.phase === 'loading' && <div className="loading" role="status">Lade Konto …</div>}
    {s.phase === 'link' && s.link && <LinkPrompt link={s.link} />}
    {s.user && s.phase !== 'link' && s.phase !== 'loading' && (<>
      <section className="box">
        <h3>Angemeldet</h3>
        <p>{s.user.email}</p>
        <p className="muted"><span className={'sync ' + cls} role="status">{label}{s.lastSync && s.phase === 'synced' ? `, zuletzt um ${s.lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}</span></p>
        <p className="muted">Jede Änderung wird im Hintergrund gesichert. Ohne Netz speichert die Pokerschule wie bisher in diesem Browser und holt die Sicherung nach.</p>
        <div><button className="btn" onClick={() => A.syncNow()} disabled={s.phase === 'syncing'}>Jetzt synchronisieren</button></div>
      </section>
      <Profile key={s.profile?.updated_at} s={s} />
      <Backup />
      <Danger />
    </>)}
  </>);
}

/** Öffentliches Profil unter /spieler/:name. */
export function PublicProfile() {
  const { name } = useParams();
  const [p, setP] = useState(undefined), [err, setErr] = useState(null);
  useEffect(() => {
    if (!A.enabled) return;
    let alive = true;
    A.publicProfile(name).then(r => alive && setP(r), e => alive && setErr(errText(e)));
    return () => { alive = false; };
  }, [name]);
  if (!A.enabled || p === null) return <div className="page-head"><h1>Profil nicht gefunden</h1><p>Unter diesem Namen gibt es kein öffentliches Profil.</p></div>;
  if (err) return <div className="notice" role="alert">Das Profil konnte nicht geladen werden: {err}</div>;
  if (p === undefined) return <div className="loading" role="status">Lade Profil …</div>;
  return (<>
    <div className="page-head" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <span className="avatar-big" aria-hidden="true">{AVATARS[p.avatar] || p.display_name[0].toUpperCase()}</span>
      <div><h1>{p.display_name}</h1><p>Mitglied seit {new Date(p.created_at).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</p></div>
    </div>
    <div className="arena-top">
      <div className="stat"><span className="k">Gesamt-Rating</span><span className="v">{p.rating ?? '–'}</span><span className="d">{p.rating ? levelOf(p.rating).name : 'noch keine Wertung'}</span></div>
      {MODES.map(m => <div key={m.k} className="stat"><span className="k">{m.name}</span><span className="v">{p.ratings?.[m.k] ?? '–'}</span><span className="d">{p.ratings?.[m.k] ? levelOf(p.ratings[m.k]).name : 'nicht gespielt'}</span></div>)}
    </div>
    <p className="muted">{p.decisions} bewertete Entscheidungen. Ratings messen die Qualität der Entscheidungen gegen den Solver, nicht gewonnene Chips.</p>
  </>);
}
