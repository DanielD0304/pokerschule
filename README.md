# Pokerschule

Lernplattform für No-Limit Texas Hold'em nach dem Vorbild von chess.com: spielen gegen Bots, gezielt trainieren, lernen, und für jede Entscheidung eine Analyse gegen einen Solver. Bewertet wird, wie gut du entscheidest, nicht ob du die Hand gewinnst.

Die Website ist eine React-App (Vite) ohne Server. Der Fortschritt liegt im Browser; Konten und Spiel gegen Menschen folgen in einem späteren Schritt.

## Bereiche

| Seite | Inhalt |
|---|---|
| Start `/` | Empfehlung aus deinen Lecks, Ratings, Schnellstart |
| Spielen `/spielen` | Push/Fold-Arena (Match gegen Freizeitspieler- oder Nash-Bot), Preflop-Duell mit 100 BB |
| Training `/training` | Flop, River (exakt gelöst), Fehler-Training, Quiz: Wer gewinnt?, Raise oder Fold?, Pot Odds |
| Lernen `/lernen` | Ablauf einer Hand, Rangfolge, Open-Raise-Ranges |
| Statistik `/statistik` | Ratings, Genauigkeit, größte Lecks, Aktivität, Sichern/Laden, Zurücksetzen |
| Rangliste `/rangliste` | Deine Einordnung gegenüber Referenzspielern |

Jede Analyse nennt den EV aller Optionen, deinen EV-Verlust, eine Einstufung von „Bester Zug“ bis „Patzer“, den Strategie-Chart und das zugrunde liegende Modell mit seinen Grenzen.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm ci
npm run dev       # Entwicklungsserver auf http://localhost:5173
npm test          # Tests mit Abdeckungsprüfung (Kernlogik ≥ 80 %)
npm run build     # Produktions-Build nach dist/
npm run preview   # Build lokal ansehen
```

Der Evaluator-Test vergleicht 1 Mio. zufällige Hände mit einer unabhängigen Referenzbewertung und dauert etwa eine Minute. Die CI (`.github/workflows/ci.yml`) führt bei jedem Push Tests und Build aus.

### Aufbau

```
index.html          Einstieg für Vite
src/web/            React: Layout (Seitenleiste, mobile Tab-Leiste), Seiten, Designsystem (styles.css)
src/modes/          Spielmodi und Fortschritt (imperativ, in Seiten eingehängt über ModeHost)
src/core/           reine Logik ohne DOM, vollständig getestet
  evaluator.js        die einzige Handbewertung für App und Solver
  rating.js           Bewertung einer Entscheidung, Elo-Rating
  storage.js          Speicherstand v2, Migration von v1, Export/Import
  …                   Karten, Equity, Ranges, Pot Odds, Preflop, Push/Fold, Heads-up-Baum
public/data/        Solver-Daten, werden erst geladen, wenn ein Modus sie braucht
public/fonts/       JetBrains Mono (Zahlen) und ihre Lizenz; sonst Systemschrift
solver/             Solver-Skripte
test/               node:test-Suites
```

### Hosting

Die Seite ist statisch und läuft auf Vercel (`vercel.json`) oder Netlify (`netlify.toml`); beide Dateien leiten alle Pfade auf `index.html` um, damit Unterseiten auch beim direkten Aufruf funktionieren. Repository einmal im Dashboard des Anbieters verbinden; danach baut jeder Push automatisch.

### Speicherstand

Der Fortschritt liegt im `localStorage` unter dem Schlüssel `pokerschule` (Schema-Version 2). Alte v1-Stände werden beim ersten Start übernommen. Künftige Schemaänderungen kommen als Funktion in `migrations` in `src/core/storage.js`.

## Solver

Die Skripte in `solver/` erzeugen die Daten in `public/data/` neu:

| Skript | Ausgabe | Inhalt |
|---|---|---|
| `precompute.js [samples]` | `pf-data.json` | Preflop-Equity für alle 169×169 Starthände (Monte Carlo) und Push/Fold-Nash für 2–20 BB |
| `cfr.js [iter]` | `hu-strat.json` | Heads-up-Preflop mit 100 BB per CFR+. Den Baum beschreibt `data/hu-tree.json`. |
| `flopsolve.js [iter]` | `flop-data.json` | Flop-CFR+ auf Kombo-Ebene für 12 Boards, mit Lösungsgüte je Board |
| `riversolve.js [iter]` | `river-data.json` | 24 River-Spots, exakt gelöst, mit Lösungsgüte je Spot |

```bash
npm run solve     # alle vier Solver nacheinander (etwa 5 bis 20 Minuten), schreibt nach public/data/
```

**Lösungsgüte** heißt: So viel Prozent des Pots könnte ein perfekter Gegenspieler im Schnitt gegen die Strategie gewinnen. Aktuell liegen alle River-Spots bei höchstens 0,1 % und alle Flop-Boards unter 0,01 % des Pots (im Rahmen des jeweiligen Modells). Die Werte stehen in den Daten und in jeder Analyse.

## Grenzen der Modelle

- **Preflop-Quiz (6-max):** Faustregel-Ranges, nicht vom Solver berechnet.
- **Preflop (100 BB):** vereinfachter Spielbaum ohne Limps, feste Einsatzgrößen (2,5 / 10 / 22 / all-in). Nach dem Flop wird nicht weitergespielt, sondern über Equity-Realisierung bewertet.
- **Flop:** Turn und River werden nicht ausgespielt. Das Modell bevorzugt deshalb große Bets und raist öfter als echte Solver.
- **River:** Die Lösung ist exakt für diesen Baum, aber die Ranges stammen aus den vereinfachten früheren Stufen. Die Turn-Linie Check-Check ist fest vorgegeben.

## Rechtliches

Impressum, Datenschutzerklärung und Altershinweis sind in der App enthalten (Fußzeile). **Vor dem öffentlichen Betrieb müssen die gelb markierten Platzhalter in `src/web/pages/Legal.jsx` ausgefüllt werden.** Die Texte sind Vorlagen und keine Rechtsberatung.

Lizenz: Alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Die Schrift JetBrains Mono steht unter der SIL Open Font License 1.1 (`public/fonts/OFL-JetBrainsMono.txt`).
