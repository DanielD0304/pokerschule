# 06 · Plattform

Lastenheft: **D-03** (Soll, Phase 2), **D-06**, **D-07** (Kann, Phase 3), nicht-funktionale Anforderungen

## D-03 · Installierbar und offline (Progressive Web App)

- Web-App-Manifest mit Name, Icons und Farben; „Zum Startbildschirm hinzufügen“ auf iPhone und Android.
- Service Worker speichert App und die zuletzt genutzten Solver-Daten; Training funktioniert im Flugzeug.
- Aktualisierungen: Hinweis „Neue Version verfügbar – neu laden“, kein stilles Neuladen mitten in einer Hand.
- Abnahme: Seite lädt offline, ein bereits geöffneter Modus ist offline spielbar.

## D-06 · Import eigener Spielgeld-Hände

- Import von Hand-Historien als Textdatei (zunächst ein gängiges Format für Spielgeld-Tische).
- Analyse nur nachträglich und nur für Situationen, die ein gelöster Spot abdeckt (Heads-up, passende Linie). Alles andere wird als „nicht abgedeckt“ markiert.
- Ausdrücklich **keine** Hilfe während laufender Echtgeld-Sessions: kein Overlay, kein Auslesen des Bildschirms, keine Live-Anbindung an Pokerclients.
- Daten bleiben im Browser bzw. im eigenen Konto.

## D-07 · Englische Oberfläche

- Alle Texte in Sprachdateien; Deutsch bleibt Standard, Englisch wählbar.
- Erkennung über die Browsersprache, Umschalter in der Fußzeile.
- Lektionen (05) werden mit übersetzt; Begriffe wie „Bluff-Catcher“ bleiben englisch.

## Qualität und Betrieb

| Bereich | Maßnahme | Ziel |
|---|---|---|
| Barrierefreiheit | Audit nach WCAG 2.1 AA, Tastatursteuerung des Tisches, Charts mit Textalternative | keine Blocker im Audit |
| Leistung | Rechenintensives (Equity, Monte Carlo) in einen Web Worker verlagern | keine Ruckler über 100 ms |
| Ladezeit | Daten komprimieren, Code-Splitting pro Seite | erste Bedienbarkeit unter 2 s auf Mittelklasse-Handy |
| Tests | Komponenten- und End-to-End-Tests (Playwright) für die wichtigsten Abläufe | Tests bei jedem Push |
| Fehler | Fehlerprotokoll nur mit Einwilligung, ohne personenbezogene Daten | Ausfälle bemerken, ohne zu tracken |
| Sicherheit | Content Security Policy, Abhängigkeiten automatisch aktualisieren | keine bekannten kritischen Lücken |

## Aufwand

- D-03 1 Woche, D-06 2–3 Wochen, D-07 1–2 Wochen (plus Übersetzung), Qualität laufend etwa 10 % der Zeit.
