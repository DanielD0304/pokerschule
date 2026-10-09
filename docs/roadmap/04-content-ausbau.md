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
