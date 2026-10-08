# Pokerschule

Ein Trainer für No-Limit Texas Hold'em, der dich von den Grundlagen bis zum River führt. Bewertet wird, wie gut du entscheidest, nicht ob du die Hand gewinnst – ähnlich wie die Analyse bei chess.com.

Die ganze App ist eine einzige Datei: `index.html`. Sie braucht keinen Server und keinen Build-Schritt. Öffne sie im Browser.

## Bereiche

| Tab | Inhalt |
|---|---|
| Übersicht | Gesamt-Dashboard: Ratings, Genauigkeit, größte Lecks, Aktivität |
| Fehler-Training | Deine Fehler kommen wieder, nach dem Leitner-System mit drei Boxen |
| 1 · Grundlagen | Ablauf einer Hand, Positionen, Rangfolge der Hände |
| 2 · Wer gewinnt? | Showdown-Quiz |
| 3 · Preflop | Raise oder Fold im 6-max, mit vereinfachten Open-Ranges |
| 4 · Pot Odds | Call oder Fold mit Draws am Turn |
| 5 · Arena | Heads-up-Push/Fold-Match gegen einen Nash-Bot oder einen Freizeitspieler-Bot |
| 6 · Duell 100 BB | Preflop Heads-up mit 3-Bets und 4-Bets |
| 7 · Flop | Flop-Entscheidungen in Single-Raised-Pots auf 12 Boards |
| 8 · River | Exakt gelöste River-Spots, auch mit Overbets |

Nach jeder Entscheidung zeigt dir der Trainer den EV aller Optionen, deinen EV-Verlust, eine Einstufung von „Bester Zug“ bis „Patzer“ und den Strategie-Chart. Jeder Modus führt ein eigenes Elo-ähnliches Rating.

Der Fortschritt wird nur im `localStorage` des Browsers gespeichert.

## Solver

Die Strategien sind vorab berechnet und in `index.html` eingebettet. Die Skripte in `solver/` erzeugen sie neu (Node.js 18 oder neuer).

| Skript | Ausgabe | Inhalt |
|---|---|---|
| `precompute.js [samples]` | `pf-data.json` | Preflop-Equity für alle 169×169 Starthände (Monte Carlo) und Push/Fold-Nash für 2–20 BB |
| `cfr.js [iter]` | `hu-strat.json` | Heads-up-Preflop mit 100 BB per CFR+. Den Baum beschreibt `tree.json`. |
| `flopsolve.js [iter]` | `flop-data.json` | Flop-CFR+ auf Kombo-Ebene für 12 Boards. Turn und River werden über Equity-Realisierung abgebildet. |
| `riversolve.js [iter]` | `river-data.json` | 24 River-Spots, exakt gelöst. Die Ranges stammen aus dem Flop-Solver. |

Reihenfolge und Abhängigkeiten:

```bash
cd solver
node precompute.js 30000   # ~1 min
node cfr.js 3000           # Sekunden, liest pf-data.json
node flopsolve.js 1000     # ~2 min, liest pf-data.json + hu-strat.json
node riversolve.js 1500    # ~1 min, liest flop-data.json
```

Die erzeugten JSON-Dateien werden in `index.html` in die Tags `<script type="application/json">` mit den IDs `pf-data`, `hu-data`, `flop-data` und `river-data` eingefügt.

## Grenzen der Modelle

- **Preflop (100 BB):** Der Spielbaum ist vereinfacht. Es gibt keine Limps, und die Einsatzgrößen sind fest (2,5 / 10 / 22 / all-in). Nach dem Flop wird nicht weitergespielt, sondern über Equity-Realisierung bewertet.
- **Flop:** Turn und River werden nicht ausgespielt. Das Modell bevorzugt deshalb große Bets und raist öfter als echte Solver.
- **River:** Die Lösung ist exakt für diesen Baum, aber die Ranges stammen aus den vereinfachten früheren Stufen. Die Turn-Linie Check-Check ist fest vorgegeben.
