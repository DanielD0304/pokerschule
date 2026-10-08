import { Link } from 'react-router-dom';
import { useProgress } from '../useProgress.js';
import { IconPlay, IconTarget, IconBook, IconRepeat, IconUsers, IconCalc, IconGrid, IconLayers, IconSpade } from '../icons.jsx';

function Tile({ to, icon: Icon, title, text, meta, disabled }) {
  const body = (<>
    <span className="tile-icon"><Icon /></span>
    <h3>{title}</h3>
    <p>{text}</p>
    {meta && <div className="tile-meta">{meta}</div>}
  </>);
  return disabled ? <div className="tile disabled" aria-disabled="true">{body}</div> : <Link to={to} className="tile">{body}</Link>;
}
const Head = ({ title, text }) => <div className="page-head"><h1>{title}</h1><p>{text}</p></div>;
const chip = t => <span className="chip">{t}</span>;

export function PlayHub() {
  const s = useProgress();
  return (<>
    <Head title="Spielen" text="Ganze Hände gegen Bots. Nach jeder Hand bekommst du eine Analyse wie in einer Partieanalyse beim Schach." />
    <div className="grid3">
      <Tile to="/spielen/arena" icon={IconPlay} title="Push/Fold-Arena" text="Heads-up-Match mit 10 bis 20 BB. Wähle den Freizeitspieler oder den Nash-Bot." meta={<>{chip(`Rating ${Math.round(s.arena.rating)}`)}{chip(`${s.arena.mw}:${s.arena.m - s.arena.mw} Matches`)}</>} />
      <Tile to="/spielen/duell" icon={IconSpade} title="Preflop-Duell, 100 BB" text="Raise, 3-Bet, 4-Bet oder Fold gegen das Solver-Gleichgewicht." meta={chip(`Rating ${Math.round(s.duel.rating)}`)} />
      <Tile disabled icon={IconUsers} title="Online gegen Menschen" text="Spiel gegen andere Lernende mit glücksbereinigtem Rating. Kommt mit den Konten." meta={chip('Demnächst')} />
    </div>
  </>);
}

export function TrainHub() {
  const s = useProgress();
  return (<>
    <Head title="Training" text="Einzelne Situationen gezielt üben, vom Grundlagen-Quiz bis zum exakt gelösten River." />
    <h2>Solver-Training</h2>
    <div className="grid3">
      <Tile to="/training/flop" icon={IconTarget} title="Flop" text="C-Bet, Check-Raise, Verteidigen: 12 Boards, gelöst auf Kombo-Ebene." meta={chip(`Rating ${Math.round(s.flop.rating)}`)} />
      <Tile to="/training/river" icon={IconTarget} title="River" text="Value-Bet, Bluff, Bluff-Catcher, Overbets. Exakt gelöst." meta={chip(`Rating ${Math.round(s.river.rating)}`)} />
      <Tile to="/training/fehler" icon={IconRepeat} title="Fehler-Training" text="Deine eigenen Fehler, bis du sie dreimal in Folge richtig löst." meta={chip(`${s.review.items.length} offen`)} />
    </div>
    <h2>Grundlagen-Quiz</h2>
    <div className="grid3">
      <Tile to="/training/showdown" icon={IconLayers} title="Wer gewinnt?" text="Showdowns lesen: beste fünf Karten, Kicker, Split Pots." meta={chip(`${s.quiz.show.c}/${s.quiz.show.t} richtig`)} />
      <Tile to="/training/preflop" icon={IconGrid} title="Raise oder Fold?" text="Open-Raises im 6-max nach Position." meta={chip(`${s.quiz.pre.c}/${s.quiz.pre.t} richtig`)} />
      <Tile to="/training/pot-odds" icon={IconCalc} title="Pot Odds" text="Lohnt sich der Call mit einem Draw?" meta={chip(`${s.quiz.odds.c}/${s.quiz.odds.t} richtig`)} />
    </div>
  </>);
}

export function LearnHub() {
  return (<>
    <Head title="Lernen" text="Der Weg vom ersten Blatt bis zu soliden Grundlagen. Danach geht es im Training weiter." />
    <div className="grid3">
      <Tile to="/lernen/grundlagen" icon={IconBook} title="1 · So läuft eine Hand" text="Blinds, Setzrunden, Positionen und drei Leitsätze für den Anfang." />
      <Tile to="/lernen/rangfolge" icon={IconLayers} title="2 · Rangfolge der Hände" text="Von Royal Flush bis höchste Karte, mit Beispielen." />
      <Tile to="/lernen/ranges" icon={IconGrid} title="3 · Open-Raise-Ranges" text="Welche Hände du von welcher Position eröffnest." />
      <Tile to="/training/pot-odds" icon={IconCalc} title="4 · Pot Odds" text="Outs zählen und entscheiden, ob sich ein Call lohnt." />
    </div>
  </>);
}

export function Basics() {
  return (<>
    <div className="page-head">
      <Link to="/lernen" className="eyebrow">← Lernen</Link>
      <h1>So läuft eine Hand</h1>
      <p>Alles, was du für die erste Hand wissen musst.</p>
    </div>
    <div className="grid2">
      <section className="box"><h3>Ablauf</h3><p>Zwei Spieler zahlen Pflichteinsätze (Small Blind und Big Blind). Jeder bekommt zwei verdeckte Karten. Dann folgen vier Setzrunden: <b>Preflop</b>, <b>Flop</b> (3 Karten offen), <b>Turn</b> (4. Karte) und <b>River</b> (5. Karte). In jeder Runde kannst du checken, setzen, callen, erhöhen oder folden. Am Ende bildet jeder die beste Hand aus fünf Karten, aus seinen zwei und den fünf Gemeinschaftskarten.</p></section>
      <section className="box"><h3>Positionen am 6er-Tisch</h3><p><b>UTG → HJ → CO → BTN → SB → BB.</b> Wer später handelt, sieht mehr, bevor er entscheiden muss. Darum spielst du vom Button viel mehr Hände als aus UTG.</p></section>
      <section className="box"><h3>Drei Leitsätze</h3><p>Spiele wenige Hände, die aber aggressiv: raisen statt callen. Achte immer auf deine Position. Calle nur, wenn die Pot Odds stimmen, nicht weil du „sehen willst“.</p></section>
      <section className="box"><h3>Dein Lernpfad</h3>
        <ol className="path">
          <li><Link to="/lernen/rangfolge">Rangfolge</Link> lernen, dann im Quiz <Link to="/training/showdown">Wer gewinnt?</Link> Showdowns lesen.</li>
          <li><Link to="/lernen/ranges">Preflop-Ranges</Link>: welche Hände du von welcher Position eröffnest.</li>
          <li><Link to="/training/pot-odds">Pot Odds</Link>: wann sich ein Call mit einem Draw rechnet.</li>
          <li>In der <Link to="/spielen/arena">Arena</Link> und im <Link to="/spielen/duell">Duell</Link> ganze Hände spielen.</li>
        </ol>
      </section>
    </div>
  </>);
}
