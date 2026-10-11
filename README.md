# Pokerschule

Lernplattform für No-Limit Texas Hold'em nach dem Vorbild von chess.com: spielen gegen Bots, gezielt trainieren, lernen, und für jede Entscheidung eine Analyse gegen einen Solver. Bewertet wird, wie gut du entscheidest, nicht ob du die Hand gewinnst.

Die Website ist eine React-App (Vite). Der Fortschritt liegt im Browser; mit einem freiwilligen Konto (Supabase) wird er auf allen Geräten synchronisiert, und man kann online gegen andere Menschen spielen.

## Bereiche

| Seite | Inhalt |
|---|---|
| Start `/` | Empfehlung aus deinen Lecks, Ratings, Schnellstart |
| Spielen `/spielen` | Push/Fold-Arena (Match gegen Freizeitspieler- oder Nash-Bot), Preflop-Duell mit 100 BB |
| Online `/spielen/online` | Heads-up gegen Menschen (Push/Fold, Preflop-Duell), glücksbereinigtes Rating, Einladung per Link, Revanche, Analyse beider Spieler, Match-Verlauf |
| Training `/training` | Flop (60 Boards nach Typ), Turn (samt River gelöst), River (exakt gelöst), Fehler-Training, Quiz: Wer gewinnt?, Raise oder Fold?, Pot Odds |
| Lernen `/lernen` | Ablauf einer Hand, Rangfolge, Open-Raise-Ranges |
| Statistik `/statistik` | Ratings, Genauigkeit, größte Lecks, Aktivität, Sichern/Laden, Zurücksetzen |
| Rangliste `/rangliste` | Ranglisten je Modus und gesamt, für alle, Freunde oder eine Gruppe; Zuwachs dieser Woche und dieses Monats; Referenzspieler; Abzeichen |
| Wochen-Challenge `/rangliste/woche` | Jede Woche 20 gleiche Spots für alle, Wertung nach EV-Verlust, Auflösung am Sonntag |
| Gruppen `/rangliste/gruppen` | Gruppen mit Einladungslink, Gruppenrangliste, Spot-Sets der Gruppenleitung |
| Freunde `/rangliste/freunde` | Freundes-Link, Anfragen, Vergleich „du gegen Freund“ je Situation |
| Konto `/konto` | Anmeldung per E-Mail-Link, Synchronisierung, Profil, Datenexport, Konto löschen |
| Profil `/spieler/:name` | Öffentliches Profil (nur wenn eingeschaltet) |

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
  sync.js             Zusammenführen zweier Stände (Gerät und Konto)
  online.js           Online-Match: Regeln, Sicht je Platz, glücksbereinigtes Elo, Fair Play
  spots.js            einzelne Entscheidungs-Spots aus den Solver-Daten (Wochen-Challenge, Spot-Sets)
  community.js        Ranglisten-Regeln, Woche/Monat, Challenge-Wertung, Freundesvergleich, Abzeichen
  …                   Karten, Equity, Ranges, Pot Odds, Preflop, Push/Fold, Heads-up-Baum
public/data/        Solver-Daten, werden erst geladen, wenn ein Modus sie braucht
public/fonts/       JetBrains Mono (Zahlen) und ihre Lizenz; sonst Systemschrift
solver/             Solver-Skripte
supabase/           Datenbank-Schema mit Row Level Security, pgTAP-Tests, Edge Functions „online“ und „challenge“
scripts/            sync-functions.js: kopiert Kernlogik und Solver-Daten für die Edge Functions
test/               node:test-Suites; database.test.js prüft die Migrationen in PGlite (ohne Docker)
```

### Hosting

Die Seite ist statisch und läuft auf Vercel (`vercel.json`) oder Netlify (`netlify.toml`); beide Dateien leiten alle Pfade auf `index.html` um, damit Unterseiten auch beim direkten Aufruf funktionieren. Repository einmal im Dashboard des Anbieters verbinden; danach baut jeder Push automatisch.

### Konten

Konten sind optional. Ohne `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (siehe `.env.example`) ist die Funktion aus. Einrichtung: [docs/konten-einrichten.md](docs/konten-einrichten.md). Die Supabase-Bibliothek wird erst geladen, wenn jemand angemeldet ist oder die Konto-Seite öffnet; der Startdownload bleibt klein.

### Online-Spiel

Braucht Konten und zusätzlich die Edge Function `supabase/functions/online`, die als autoritativer Server mischt, austeilt und bewertet. Einrichtung und Funktionsweise: [docs/online-einrichten.md](docs/online-einrichten.md). Nach Änderungen an `src/core` oder `public/data` `npm run functions:sync` ausführen; die Tests prüfen, dass die Kopie für den Server aktuell ist.

### Ranglisten, Gruppen und Wochen-Challenge

Brauchen Konten; die Wochen-Challenge zusätzlich die Edge Function `supabase/functions/challenge`. Einrichtung und Regeln: [docs/community-einrichten.md](docs/community-einrichten.md).

### Speicherstand

Der Fortschritt liegt im `localStorage` unter dem Schlüssel `pokerschule` (Schema-Version 2). Alte v1-Stände werden beim ersten Start übernommen. Künftige Schemaänderungen kommen als Funktion in `migrations` in `src/core/storage.js`.

## Solver

Die Skripte in `solver/` erzeugen die Daten in `public/data/` neu:

| Skript | Ausgabe | Inhalt |
|---|---|---|
| `precompute.js [samples]` | `pf-data.json` | Preflop-Equity für alle 169×169 Starthände (Monte Carlo) und Push/Fold-Nash für 2–20 BB |
| `cfr.js [iter]` | `hu-strat.json` | Heads-up-Preflop mit 100 BB per CFR+. Den Baum beschreibt `data/hu-tree.json`. |
| `flopsolve.js [iter] [--fehlende]` | `flop/index.json`, `flop/<board>.json` | Flop-CFR+ auf Kombo-Ebene für 60 Boards nach Typ (Auswahl und Gewichte: `src/core/flops.js`), eine Datei je Board, mit Lösungsgüte; `--fehlende` setzt einen abgebrochenen Lauf fort |
| `turnsolve.js [iter] [--fehlende]` | `turn/index.json`, `turn/<spot>.json` | 60 Turn-Spots (je Flop-Board eine Turn-Karte), gelöst samt River-Spiel auf allen 44 River-Karten; gespeichert werden die Turn-Entscheidungen |
| `riversolve.js [iter]` | `river-data.json` | 24 River-Spots auf den 12 festen Flop-Boards, exakt gelöst, mit Lösungsgüte je Spot |

```bash
npm run solve     # alle fünf Solver nacheinander (etwa 1 Stunde, davon Turn ~50 Min. auf 16 Threads), schreibt nach public/data/
```

**Lösungsgüte** heißt: So viel Prozent des Pots könnte ein perfekter Gegenspieler im Schnitt gegen die Strategie gewinnen. Aktuell liegen alle River-Spots bei höchstens 0,1 % und alle Flop-Boards unter 0,01 % des Pots (im Rahmen des jeweiligen Modells). Die Werte stehen in den Daten und in jeder Analyse.

## Grenzen der Modelle

- **Preflop-Quiz (6-max):** Faustregel-Ranges, nicht vom Solver berechnet.
- **Preflop (100 BB):** vereinfachter Spielbaum ohne Limps, feste Einsatzgrößen (2,5 / 10 / 22 / all-in). Nach dem Flop wird nicht weitergespielt, sondern über Equity-Realisierung bewertet.
- **Flop:** 60 Boards vertreten alle 22 100 Flops; jedes steht für eine Gruppe ähnlicher Flops und wird so oft gezogen, wie diese vorkommt. Innerhalb einer Gruppe kann die richtige Strategie abweichen. Turn und River werden nicht ausgespielt. Das Modell bevorzugt deshalb große Bets und raist öfter als echte Solver.
- **Turn:** Turn und River sind für den Spielbaum exakt gelöst; trainiert wird nur die Turn-Entscheidung. Geht eine Hand zum River, zählt für die EV-Bilanz die Equity ohne weiteres Setzen. Die Ranges stammen aus den vereinfachten früheren Stufen.
- **River:** Die Lösung ist exakt für diesen Baum, aber die Ranges stammen aus den vereinfachten früheren Stufen. Die Turn-Linie Check-Check ist fest vorgegeben.

## Rechtliches

Impressum, Datenschutzerklärung und Altershinweis sind in der App enthalten (Fußzeile). **Vor dem öffentlichen Betrieb müssen die gelb markierten Platzhalter in `src/web/pages/Legal.jsx` ausgefüllt werden.** Die Texte sind Vorlagen und keine Rechtsberatung.

Lizenz: Alle Rechte vorbehalten, siehe [LICENSE](LICENSE). Die Schrift JetBrains Mono steht unter der SIL Open Font License 1.1 (`public/fonts/OFL-JetBrainsMono.txt`).
