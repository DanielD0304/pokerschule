# Pokerschule

Ein Trainer für No-Limit Texas Hold'em, der von den Grundlagen bis zum River führt. Bewertet wird, wie gut du entscheidest, nicht ob du die Hand gewinnst – ähnlich wie die Analyse bei chess.com.

Die fertige App ist eine einzige Datei: **`dist/index.html`**. Sie braucht keinen Server und stellt keine Anfragen an Dritte; Schriften und Solver-Daten sind eingebettet. Öffne sie im Browser oder lege sie auf ein statisches Hosting.

## Bereiche

| Tab | Inhalt |
|---|---|
| Übersicht | Gesamt-Dashboard: Ratings, Genauigkeit, größte Lecks, Aktivität; Fortschritt sichern und laden |
| Fehler-Training | Deine Fehler kommen wieder, nach dem Leitner-System mit drei Boxen |
| 1 · Grundlagen | Ablauf einer Hand, Positionen, Rangfolge der Hände |
| 2 · Wer gewinnt? | Showdown-Quiz |
| 3 · Preflop | Raise oder Fold im 6-max mit Faustregel-Ranges, Hände in echter Verteilung |
| 4 · Pot Odds | Call oder Fold mit Draws, in BB; Turn (eine Karte) und Flop (zwei Karten), mit Hinweisen zu unsauberen Outs |
| 5 · Arena | Heads-up-Push/Fold-Match gegen einen Nash-Bot oder einen Freizeitspieler-Bot |
| 6 · Duell 100 BB | Preflop heads-up mit 3-Bets und 4-Bets |
| 7 · Flop | Flop-Entscheidungen in Single-Raised-Pots auf 12 Boards |
| 8 · River | Exakt gelöste River-Spots, auch mit Overbets |

Jede Analyse nennt den EV aller Optionen, deinen EV-Verlust, eine Einstufung von „Bester Zug“ bis „Patzer“, den Strategie-Chart und das zugrunde liegende Modell mit seinen Grenzen.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm ci
npm test          # alle Tests mit Abdeckungsprüfung (Kernlogik ≥ 80 %)
npm run build     # src/ + data/ + fonts/ → dist/index.html
```

`npm run test:fast` lässt die Tests ohne Abdeckungsmessung laufen. Der Evaluator-Test vergleicht 1 Mio. zufällige Hände mit einer unabhängigen Referenzbewertung und dauert etwa eine Minute.

Die CI (`.github/workflows/ci.yml`) führt bei jedem Push Tests und Build aus und prüft, dass das eingecheckte `dist/index.html` aktuell ist. Nach Änderungen an `src/`, `data/` oder `fonts/` also immer `npm run build` ausführen und `dist/index.html` mit committen.

### Aufbau

```
src/core/      reine Logik ohne DOM, vollständig getestet
  cards.js       Kartenkodierung, 169 Starthand-Klassen
  evaluator.js   die einzige Handbewertung für App und Solver
  equity.js      Equity Hand gegen Hand (Monte Carlo, exakt)
  ranges.js      Range-Notation
  rating.js      Bewertung einer Entscheidung, Elo-Rating
  potodds.js     Pot-Odds-Szenarien
  preflop.js     Preflop-Tabellen aus den Solver-Daten
  pushfold.js    Push/Fold-Bots und EV
  hutree.js      EV im Heads-up-Preflop-Baum
  storage.js     Speicherstand v2, Migration von v1, Export/Import
src/app/       Oberfläche, ein Modul je Tab
src/index.html, src/styles.css
solver/        Solver-Skripte (nutzen src/core/evaluator.js)
data/          erzeugte Solver-Daten
fonts/         eingebettete Schriften und ihre Lizenzen
test/          node:test-Suites
dist/          Build-Ergebnis
```

### Speicherstand

Der Fortschritt liegt im `localStorage` unter dem Schlüssel `pokerschule` (Schema-Version 2). Alte v1-Stände (`pokerschule.*.v1`) werden beim ersten Start übernommen und danach gelöscht. Künftige Schemaänderungen kommen als Funktion in `migrations` in `src/core/storage.js`.

## Solver

Die Skripte in `solver/` erzeugen die Daten in `data/` neu:

| Skript | Ausgabe | Inhalt |
|---|---|---|
| `precompute.js [samples]` | `pf-data.json` | Preflop-Equity für alle 169×169 Starthände (Monte Carlo) und Push/Fold-Nash für 2–20 BB |
| `cfr.js [iter]` | `hu-strat.json` | Heads-up-Preflop mit 100 BB per CFR+. Den Baum beschreibt `data/hu-tree.json`. |
| `flopsolve.js [iter]` | `flop-data.json` | Flop-CFR+ auf Kombo-Ebene für 12 Boards, mit Lösungsgüte je Board |
| `riversolve.js [iter]` | `river-data.json` | 24 River-Spots, exakt gelöst, mit Lösungsgüte je Spot |

```bash
npm run solve     # alle vier Solver nacheinander, danach Build (etwa 5 bis 20 Minuten)
```

**Lösungsgüte** heißt: So viel Prozent des Pots könnte ein perfekter Gegenspieler im Schnitt gegen die Strategie gewinnen. Aktuell liegen alle River-Spots bei höchstens 0,1 % und alle Flop-Boards unter 0,01 % des Pots (im Rahmen des jeweiligen Modells). Die Werte stehen in den Daten und in jeder Analyse.

## Grenzen der Modelle

- **Preflop-Quiz (6-max):** Faustregel-Ranges, nicht vom Solver berechnet.
- **Preflop (100 BB):** vereinfachter Spielbaum ohne Limps, feste Einsatzgrößen (2,5 / 10 / 22 / all-in). Nach dem Flop wird nicht weitergespielt, sondern über Equity-Realisierung bewertet.
- **Flop:** Turn und River werden nicht ausgespielt. Das Modell bevorzugt deshalb große Bets und raist öfter als echte Solver.
- **River:** Die Lösung ist exakt für diesen Baum, aber die Ranges stammen aus den vereinfachten früheren Stufen. Die Turn-Linie Check-Check ist fest vorgegeben.

## Rechtliches

Impressum, Datenschutzerklärung und Altershinweis sind in der App enthalten (Fußzeile). **Vor dem öffentlichen Betrieb müssen die gelb markierten Platzhalter im Impressum und in der Datenschutzerklärung (Abschnitt „RECHTLICHES“ in `src/index.html`) ausgefüllt werden.** Die Texte sind Vorlagen und keine Rechtsberatung.

Lizenz: Alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Die eingebetteten Schriften stehen unter der SIL Open Font License 1.1 (`fonts/OFL-*.txt`).
