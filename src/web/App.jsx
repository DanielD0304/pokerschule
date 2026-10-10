import { Routes, Route, useNavigate, Link } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './Layout.jsx';
import ModeHost from './ModeHost.jsx';
import Home from './pages/Home.jsx';
import { PlayHub, TrainHub, LearnHub, Basics } from './pages/Hubs.jsx';
import Stats from './pages/Stats.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
// Community-Seiten erst laden, wenn sie gebraucht werden (kleiner Startdownload)
const Weekly = lazy(() => import('./pages/Weekly.jsx'));
const Groups = lazy(() => import('./pages/Groups.jsx'));
const GroupPage = lazy(() => import('./pages/Groups.jsx').then(m => ({ default: m.GroupPage })));
const SetTrainer = lazy(() => import('./pages/Groups.jsx').then(m => ({ default: m.SetTrainer })));
const Friends = lazy(() => import('./pages/Friends.jsx'));
const Lazy = ({ children }) => <Suspense fallback={<div className="loading" role="status">Lade …</div>}>{children}</Suspense>;
import { Impressum, Datenschutz, Lizenz, Regeln } from './pages/Legal.jsx';
import Account, { PublicProfile } from './pages/Account.jsx';
import Online, { MatchPage } from './pages/Online.jsx';
import { setNavigator } from '../modes/nav.js';
import { NEEDS } from '../modes/data.js';
import * as M from './markup.js';
import { mountArena } from '../modes/arena.js';
import { mountDuel } from '../modes/duel.js';
import { mountFlop } from '../modes/flop.js';
import { mountRiver } from '../modes/river.js';
import { mountReview } from '../modes/review.js';
import { mountShow, mountPre, mountOdds, mountRanking, mountRanges } from '../modes/quiz.js';

function ModePage({ eyebrow, title, intro, back, children }) {
  return (
    <>
      <div className="page-head">
        {back && <Link to={back.to} className="eyebrow">← {back.label}</Link>}
        {eyebrow && !back && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {children}
    </>
  );
}
const SPIELEN = { to: '/spielen', label: 'Spielen' }, TRAINING = { to: '/training', label: 'Training' }, LERNEN = { to: '/lernen', label: 'Lernen' };

function NotFound() {
  return <ModePage title="Seite nicht gefunden" intro="Diese Seite gibt es nicht."><p><Link to="/">Zur Startseite</Link></p></ModePage>;
}

export default function App() {
  const navigate = useNavigate();
  useEffect(() => { setNavigator(p => navigate(p)); }, [navigate]);
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="spielen" element={<PlayHub />} />
        <Route path="spielen/arena" element={<ModePage back={SPIELEN} title="Push/Fold-Arena" intro="Heads-up-Match mit kurzen Stacks: Ihr startet mit gleich vielen Chips und spielt, bis einer pleite ist. Bewertet wird deine Entscheidung, nicht das Ergebnis."><ModeHost html={M.ARENA} mount={mountArena} needs={NEEDS.arena} /></ModePage>} />
        <Route path="spielen/duell" element={<ModePage back={SPIELEN} title="Preflop-Duell, 100 BB" intro="Heads-up mit tiefen Stacks gegen das Solver-Gleichgewicht: Raises, 3-Bets, 4-Bets. Nach jeder Hand bekommst du die Analyse."><ModeHost html={M.DUEL} mount={mountDuel} needs={NEEDS.duel} /></ModePage>} />
        <Route path="spielen/online" element={<Online />} />
        <Route path="spielen/online/match/:id" element={<MatchPage />} />
        <Route path="training" element={<TrainHub />} />
        <Route path="training/flop" element={<ModePage back={TRAINING} title="Flop-Training" intro="Single-Raised-Pot, 100 BB: Der Small Blind hat erhöht, der Big Blind gecallt. Du spielst abwechselnd beide Seiten auf 12 typischen Flops."><ModeHost html={M.FLOP} mount={mountFlop} needs={NEEDS.flop} /></ModePage>} />
        <Route path="training/river" element={<ModePage back={TRAINING} title="River-Training" intro="Die letzte Setzrunde, exakt gelöst: Value-Bets, Bluffs, Bluff-Catcher und Einsatzgrößen bis zum Overbet."><ModeHost html={M.RIVER} mount={mountRiver} needs={NEEDS.river} /></ModePage>} />
        <Route path="training/fehler" element={<ModePage back={TRAINING} title="Fehler-Training" intro="Situationen, in denen du daneben lagst, kommen wieder. Dreimal in Folge richtig, und sie ist gemeistert. Das Rating ändert sich hier nicht."><ModeHost html={M.REVIEW} mount={mountReview} /></ModePage>} />
        <Route path="training/showdown" element={<ModePage back={TRAINING} title="Wer gewinnt?" intro="Jeder nutzt die besten 5 von 7 Karten. Achte auf Kicker, Flush-Möglichkeiten und geteilte Pots."><ModeHost html={M.SHOW} mount={mountShow} /></ModePage>} />
        <Route path="training/preflop" element={<ModePage back={TRAINING} title="Raise oder Fold?" intro="6-max, 100 Big Blinds, alle vor dir haben gefoldet. Eröffnest du mit einem Raise auf 2,5 BB?"><ModeHost html={M.PRE} mount={mountPre} /></ModePage>} />
        <Route path="training/pot-odds" element={<ModePage back={TRAINING} title="Lohnt sich der Call?" intro="Du hast einen Draw, der Gegner geht all-in. Am Turn kommt noch eine Karte, am Flop zwei. Alle Beträge in Big Blinds."><ModeHost html={M.ODDS} mount={mountOdds} /></ModePage>} />
        <Route path="lernen" element={<LearnHub />} />
        <Route path="lernen/grundlagen" element={<Basics />} />
        <Route path="lernen/rangfolge" element={<ModePage back={LERNEN} title="Rangfolge der Hände" intro="Von der stärksten zur schwächsten Hand. Es zählen immer die besten fünf Karten."><ModeHost html={M.RANKING} mount={mountRanking} /></ModePage>} />
        <Route path="lernen/ranges" element={<ModePage back={LERNEN} title="Open-Raise-Ranges" intro="Welche Hände du im 6-max von welcher Position eröffnest."><ModeHost html={M.RANGES} mount={mountRanges} /></ModePage>} />
        <Route path="statistik" element={<Stats />} />
        <Route path="rangliste" element={<Leaderboard />} />
        <Route path="rangliste/woche" element={<Lazy><Weekly /></Lazy>} />
        <Route path="rangliste/gruppen" element={<Lazy><Groups /></Lazy>} />
        <Route path="rangliste/gruppen/:id" element={<Lazy><GroupPage /></Lazy>} />
        <Route path="rangliste/gruppen/:id/set/:set" element={<Lazy><SetTrainer /></Lazy>} />
        <Route path="rangliste/freunde" element={<Lazy><Friends /></Lazy>} />
        <Route path="konto" element={<Account />} />
        <Route path="spieler/:name" element={<PublicProfile />} />
        <Route path="impressum" element={<Impressum />} />
        <Route path="datenschutz" element={<Datenschutz />} />
        <Route path="lizenz" element={<Lizenz />} />
        <Route path="regeln" element={<Regeln />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
