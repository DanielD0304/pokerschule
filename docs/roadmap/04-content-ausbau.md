# 04 · Content-Ausbau

Lastenheft: **B-01** (Muss), **B-03** bis **B-07** (Soll/Kann), Phase 2–3

## Ziel

Mehr und realistischere Situationen: vom einzelnen Flop-Spot zur ganzen Hand, von Single-Raised-Pots zu 3-Bet-Pots, von Heads-up zu typischen 6-max-Konstellationen.

## Übersicht

| ID | Feature | Priorität | Rechenzeit (lokal) | Daten |
|---|---|---|---|---|
| B-01 | 60 Flops nach Board-Typ | Muss | ~10 Min. | ~8 MB, pro Board nachgeladen |
| B-03 | Turn-Training (Single-Raised-Pot) | Soll | ~30–60 Min. | pro Spot ~150 KB |
| B-04 | Ganze Hand Preflop bis River | Soll | nutzt vorhandene Lösungen | – |
| B-05 | 3-Bet-Pots auf Flop und River | Soll | ~15 Min. | ~3 MB |
| B-06 | 6-max-Postflop (BTN–BB, CO–BB, SB–BB) | Soll | ~1 Std. | ~10 MB |
| B-07 | Postflop-Bot-Stile | Kann | keine | – |

## B-01 · 60 Flops nach Board-Typ

- Auswahl repräsentativer Flops nach Gruppen: trocken (A72r), nass (JT9 zweifarbig), gepaart (884), monoton (T52 einfarbig), Broadway (AKQ), niedrig (532).
- Filter im Training: „Nur nasse Boards“, „Nur gepaarte Boards“.
- Gewichtung nach Häufigkeit: Strategisch gleichwertige Flops (Farbisomorphie) werden zusammengefasst, damit 60 Boards einen großen Teil aller Flops abdecken.
- Daten pro Board als eigene Datei, komprimiert (Brotli über Vercel), nur bei Bedarf geladen.

## B-03 · Turn-Training

- Linie: Raise, Call; Flop C-Bet, Call; Turn-Entscheidung.
- Exakt gelöst über alle River-Karten mit festem Baum (Check, ⅓, ¾, Overbet; Raise auf das Dreifache).
- Lehrschwerpunkt: zweite Barrel, Check-Back, Verteidigung gegen Turn-Bets.
- Rechenaufwand höher als am River; Lösen pro Spot im Hintergrund mit mehreren Kernen.

## B-04 · Ganze Hand

- Eine Hand von Preflop bis River gegen den Bot, ohne Unterbrechung.
- Für jede Straße die passende vorhandene Lösung (Duell → Flop → Turn → River), Übergänge über die Ranges aus der jeweiligen Linie.
- Am Ende eine Analyse aller Entscheidungen, ähnlich der Partieanalyse bei chess.com: eine Zeitleiste mit Einstufungen, Klick auf eine Entscheidung zeigt Tisch, EV-Tabelle und Chart.
- Wenn eine Linie nicht gelöst ist (z. B. Turn nach Check-Raise), endet die Hand dort mit Modellbewertung und Hinweis.

## B-05 · 3-Bet-Pots

- Ranges aus dem Preflop-Duell (3-Bet, Call), Flop und River wie im Single-Raised-Pot.
- Niedrigeres Stack-zu-Pot-Verhältnis → andere Einsatzgrößen (⅓, ½, All-in).

## B-06 · 6-max-Postflop

- Drei Konstellationen: Button gegen Big Blind, Cutoff gegen Big Blind, Small Blind gegen Big Blind.
- Ranges aus einem 6-max-Preflop-Modell (ersetzt die heutigen Faustregel-Ranges im Quiz durch Solver-Ranges).
- Kein Multiway (Nicht-Ziel des Lastenhefts).

## B-07 · Postflop-Bot-Stile

- Wie in der Arena: „Passiver Caller“ (callt zu viel, blufft selten) und „Zu enger Spieler“ (foldet zu viel).
- Umsetzung über Abweichungen von der Gleichgewichtsstrategie und Best-Response-Berechnung für die Bewertung.
- Lernziel: exploitatives Spiel. Bewertung immer gegen den gewählten Gegner, wie heute in der Arena.

## Abnahmekriterien

- Mindestens 60 Flop-Boards, Turn-Training und ganze Hände spielbar (Lastenheft Phase 2).
- Lösungsgüte je Spot dokumentiert und in der App sichtbar.
- Startdownload bleibt unter 500 KB; Daten werden nur für den gewählten Modus geladen.

## Aufwand und Risiken

- Aufwand: B-01 1 Woche, B-03 2 Wochen, B-04 2 Wochen, B-05 1 Woche, B-06 3 Wochen, B-07 1 Woche.
- Risiko Rechenzeit: Turn und 6-max sind deutlich teurer → Solver parallelisieren, nur lösen, was im Training vorkommt.
- Risiko Modellgrenzen: Die Flop-Lösung nutzt weiter Equity-Realisierung → mit dem Turn-Solver lässt sich prüfen, wie groß der Fehler ist, und die Hinweise in der App entsprechend anpassen.

## Stand der Umsetzung

| ID | Stand |
|---|---|
| B-01 · 60 Flops nach Board-Typ | umgesetzt am 10. Oktober 2026 (Details unten) |
| B-03 · Turn-Training | umgesetzt am 11. Oktober 2026 (Details unten) |
| B-04 bis B-07 | offen |

### B-01 im Einzelnen

- **Auswahl** (`src/core/flops.js`): Die 22 100 möglichen Flops ergeben nach Farbvertauschung 1 755 strategisch verschiedene. Daraus wählt `selectFlops` 60 Boards: Plätze je Typ (ungepaart mit drei, zwei oder einer Farbe, gepaart, Drilling) nach Häufigkeit mit Mindestzahlen, die großen Typen zusätzlich nach der höchsten Karte geteilt, darin gewichtete k-Medoids über Ränge, Straßenmöglichkeit und Flush-Struktur. Die bisherigen 12 Boards sind fest dabei, weil die River-Spots auf ihnen beruhen; ihre Lösungen sind bit-genau gleich geblieben.
- **Gewichtung**: Jedes Board steht für die Flops, die ihm am nächsten sind (Anteil steht in den Daten und im Training, z. B. „steht für 2,1 % aller Flops“). Gezogen wird nach diesem Anteil, damit das Training der Verteilung echter Hände folgt.
- **Filter** im Flop-Training: Trocken, Nass, Gepaart, Monoton, Broadway, Niedrig, Ass-hoch (jeweils mindestens 4 Boards); die Wahl bleibt gespeichert.
- **Daten**: `public/data/flop/index.json` (5 KB) und je Board eine Datei (zusammen 8,1 MB, je etwa 135 KB). Geladen werden der Index und das ausgeteilte Board; das nächste lädt während der laufenden Hand. Vorher lud das Flop-Training 1,6 MB auf einmal.
- **Lösungsgüte**: alle 60 Boards höchstens 0,007 % des Pots ausnutzbar (1 000 Iterationen CFR+, 9 Minuten auf 16 Threads), sichtbar in jeder Analyse.
- Wochen-Challenge und Spot-Sets der Gruppen ziehen Flop-Spots ebenfalls aus allen 60 Boards, gewichtet nach Häufigkeit.

Grenze: Innerhalb einer Gruppe ähnlicher Flops kann die beste Strategie abweichen; das Board vertritt sie nur. Turn und River werden weiter über Equity-Realisierung geschätzt.

### B-03 im Einzelnen

- **Solver** (): Turn samt River auf allen 44 River-Karten, CFR+ mit abwechselnden Updates. River-Baum: Check, ⅓, ¾, Overbet, Raise auf das Dreifache, Einsätze auf den Stack begrenzt. Showdown über sortierte Ränge mit Karten-Blockern statt Hand gegen Hand (gegen Brute Force geprüft). Gespeichert werden nur die Turn-Entscheidungen.
- **Spots**: je Flop-Board eine Turn-Karte (60 Spots, zusammen 4,5 MB, etwa 75 KB je Spot), Ranges aus der Flop-Lösung (BB checkt, SB setzt die häufigere C-Bet-Größe, BB callt). Gezogen nach Häufigkeit des Flops, geladen erst beim Austeilen.
- **Lösungsgüte**: 0,066 bis 0,272 % des Pots, Median 0,178 % (600 Iterationen, rund 100 Minuten auf 16 Threads).
- **Seltene Linien**: Führt der BB im Gleichgewicht nie, lernte der SB ohne Gegenmaßnahme keine sinnvolle Antwort (Fold mit zwei Paaren). Abklingendes „Zittern“ in der ersten Hälfte der Iterationen behebt das weitgehend; Restunschärfe gegen Leads im Mittel 0,15 bis 0,3 BB je Hand. Im Modellhinweis vermerkt.
- **App**: , bewerteter Modus mit Rating, Statistik, Rangliste und Freundesvergleich (Migration ). Geht eine Hand zum River, endet sie dort; die EV-Bilanz rechnet ohne weiteres Setzen, die EVs der Entscheidungen mit dem River-Spiel.
- Offen:  ist vorläufig wie beim River gesetzt, nicht eigens kalibriert.
