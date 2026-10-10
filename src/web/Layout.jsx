import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useProgress } from './useProgress.js';
import { persist } from '../modes/store.js';
import { insights } from '../modes/insights.js';
import { enabled as accountsOn } from '../modes/account.js';
import { useAccount, syncLabel, AVATARS } from './pages/Account.jsx';
import { IconHome, IconPlay, IconTarget, IconBook, IconChart, IconTrophy, IconSpade } from './icons.jsx';

const NAV = [
  { to: '/', label: 'Start', icon: IconHome, end: true },
  { to: '/spielen', label: 'Spielen', icon: IconPlay },
  { to: '/training', label: 'Training', icon: IconTarget },
  { to: '/lernen', label: 'Lernen', icon: IconBook },
  { to: '/statistik', label: 'Statistik', icon: IconChart },
  { to: '/rangliste', label: 'Rangliste', icon: IconTrophy },
];
const TABBAR = NAV;

/** „Anmelden“ bzw. Anzeigename mit Sicherungsstatus; nur, wenn Konten eingerichtet sind. */
function AccountLink({ compact }) {
  const s = useAccount();
  if (!accountsOn) return null;
  const [cls, label] = syncLabel(s);
  if (!s.user) return <Link to="/konto" className={compact ? 'chip' : 'rating-pill'}>{s.phase === 'loading' ? 'Konto …' : 'Anmelden'}</Link>;
  const name = s.profile?.display_name || 'Konto', av = AVATARS[s.profile?.avatar];
  return (
    <Link to="/konto" className={compact ? 'chip' : 'rating-pill'} aria-label={`Konto ${name}${label ? ', ' + label : ''}`} title={label}>
      <span className={'sync ' + cls}>{av ? av + ' ' : ''}{name}</span>
    </Link>
  );
}

function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark"><IconSpade /></span>Pokerschule</Link>;
}

export default function Layout() {
  const state = useProgress();
  const loc = useLocation();
  const ins = insights(state);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Hauptnavigation">
        <Brand />
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
            <n.icon />{n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <AccountLink />
          <Link to="/statistik" className="rating-pill" aria-label="Gesamt-Rating">
            <span>Gesamt-Rating</span><b>{ins.overall ?? '–'}</b>
          </Link>
          {ins.streak > 0 && <span>Serie: {ins.streak} {ins.streak === 1 ? 'Tag' : 'Tage'} in Folge</span>}
          <span><Link to="/impressum">Impressum</Link> · <Link to="/datenschutz">Datenschutz</Link></span>
        </div>
      </nav>

      <header className="topbar"><Brand /><span style={{ display: 'flex', gap: 8 }}><AccountLink compact /><Link to="/statistik" className="chip">Rating <b>{ins.overall ?? '–'}</b></Link></span></header>

      <main className="main" id="inhalt">
        <div className="page" key={loc.pathname}>
          {!state.ui.ageOk && (
            <div className="agebar" role="note">
              <p><b>Nur für Erwachsene ab 18 Jahren.</b> Die Pokerschule ist ein Lernprogramm: kein Echtgeld, keine Gewinne, keine Verbindung zu Pokeranbietern.</p>
              <button className="btn" onClick={() => { state.ui.ageOk = true; persist(); }}>Verstanden</button>
            </div>
          )}
          <Outlet />
          <footer className="foot">
            <p><b>18+</b> · Nur zum Lernen, kein Echtgeld. Glücksspiel kann süchtig machen. Hilfe und Beratung: <a href="https://www.check-dein-spiel.de" rel="noopener" target="_blank">check-dein-spiel.de</a> · BZgA-Telefon 0800 1 37 27 00 (kostenlos)</p>
            <p><Link to="/impressum">Impressum</Link> · <Link to="/datenschutz">Datenschutz</Link> · <Link to="/regeln">Nutzungsbedingungen</Link> · <Link to="/lizenz">Lizenz</Link></p>
          </footer>
        </div>
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABBAR.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <n.icon /><span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
