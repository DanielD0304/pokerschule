# Ranglisten, Gruppen und Wochen-Challenge einrichten (Supabase)

Anleitung zu Roadmap [03 · Ranglisten und Gruppen](roadmap/03-ranglisten-und-gruppen.md). Voraussetzung sind eingerichtete Konten ([konten-einrichten.md](konten-einrichten.md)); für die Online-Ranglisten außerdem das Online-Spiel ([online-einrichten.md](online-einrichten.md)).

## 1. Datenbank

Die Migration `supabase/migrations/20261011000000_community.sql` ergänzt die Profile (Entscheidungen je Modus, letzte Aktivität, Wochen-Challenge) und legt Rating-Verlauf, Freunde, Gruppen, Spot-Sets und die Wochen-Challenge an.

```bash
npx supabase db push
```

Ohne CLI: den Inhalt im *SQL Editor* ausführen. Realtime ist nicht nötig.

**Tests:** `npm test` spielt alle Migrationen in PGlite (Postgres als WebAssembly, ohne Docker) ein und prüft jede Funktion und jedes Zugriffsrecht (`test/database.test.js`). Supabase-Auth ist dort nachgebildet; ein Lauf gegen ein echtes Projekt bleibt vor dem Start sinnvoll.

## 2. Edge Function

Die Wochen-Challenge läuft über die Edge Function `supabase/functions/challenge`. Sie nutzt dieselbe Kernlogik wie die Website (`src/core/spots.js`, `src/core/community.js`) und die Solver-Daten für Flop, River und Duell; Kopien liegen in `supabase/functions/_shared` (etwa 3,5 MB). Nach Änderungen an `src/core` oder `public/data`:

```bash
npm run functions:sync
npx supabase functions deploy challenge
```

`ALLOWED_ORIGIN` wie bei der Function `online`.

## 3. Wie es funktioniert

| Was | Wo | Wer liest |
|---|---|---|
| Ratings, Entscheidungen je Modus, letzte Aktivität | `profiles` | wie das Profil; Ranglisten über `leaderboard()` |
| Stand je Tag (Beginn und Ende) | `rating_history` | nur `leaderboard()` für „diese Woche“ und „dieser Monat“ |
| Freundschaften, Freundes-Links | `friendships`, `friend_links` | nur über `friends_list()`, `friend_compare()` usw. |
| Gruppen, Mitglieder, Einladungen, Spot-Sets, Übungsstand | `groups`, `group_members`, `group_invites`, `group_sets`, `group_set_progress` | nur Mitglieder, über `group_info()` |
| Spots der Woche mit allen EVs | `weekly.spots` | nur der Server |
| Antworten und Ergebnis | `weekly_entries` | nur der Server; Wertung über `weekly_board()` |

Alle neuen Tabellen haben Row Level Security ohne Richtlinien. Browser greifen nur über `security definer`-Funktionen zu, die selbst prüfen, ob jemand Mitglied, Leitung oder befreundet ist.

**Ranglisten** (`leaderboard`): global nur öffentliche Profile mit mindestens 200 Entscheidungen (online: 10 gewertete Matches), die in den letzten 30 Tagen aktiv waren; gesperrte Konten (`fair_play.banned`) nie. Bei gleichem Rating stehen mehr Entscheidungen vorn. „Diese Woche“ und „dieser Monat“ sortieren nach Zuwachs seit Montag bzw. Monatsanfang (deutsche Zeit). Unter Freunden und in Gruppen erscheinen alle, auch private Profile; dem stimmt zu, wer die Freundschaft annimmt oder beitritt.

**Vertrauen:** Die Trainings-Ratings (Arena, Duell, Flop, River) berechnet der Browser und schreibt sie ins Profil. Werte außerhalb von 100 bis 3000 fallen aus der Rangliste; mehr lässt sich ohne Bewertung auf dem Server nicht prüfen. Fälschungssicher sind das Online-Rating und die Wochen-Challenge, die der Server bewertet. Auffällige Einträge sperrt der Betreiber über `fair_play.banned`.

**Wochen-Challenge:** Beim ersten Aufruf einer Woche (Montag 0 Uhr deutscher Zeit) erzeugt der Server 20 Spots (7 Flop, 7 River, 6 Preflop-Duell, jeweils mit mindestens 0,15 BB Abstand zwischen bester und schlechtester Option). Jeder bekommt den nächsten Spot erst nach der Antwort auf den vorigen; die Bedenkzeit misst der Server (höchstens 30 Minuten je Spot). Nach der Abgabe sieht man die Analyse und seinen Platz. Nach Sonntag 24 Uhr schließt der erste Aufruf die Woche ab: Verteilung der Antworten speichern, beste Platzierung im Profil vermerken (Abzeichen „Podest“). Global zählt der Platz unter allen Teilnehmenden, angezeigt werden öffentliche Profile und die eigene Zeile.

**Gruppen:** höchstens 50 Mitglieder, jede Person in höchstens 20 Gruppen. Einladungslinks gelten 7 Tage; die Leitung kann jederzeit einen neuen erzeugen, dann gilt der alte nicht mehr. Verlässt die letzte Leitung die Gruppe (auch durch Löschen des Kontos), übernimmt das Mitglied, das am längsten dabei ist; geht das letzte Mitglied, wird die Gruppe gelöscht. Spot-Sets sind Listen von bis zu 12 Situationen; geübt wird im Browser mit zufälligen Händen, ohne Rating-Änderung.

## 4. Betrieb

- Kosten: Ranglisten sind einfache Abfragen; die Wochen-Challenge braucht etwa 22 Function-Aufrufe je Teilnahme.
- Für viele Nutzer (mehrere Tausend Profile) lohnt sich später ein Index oder eine vorberechnete Tabelle für `leaderboard()`; heute rechnet die Funktion bei jedem Aufruf über alle Profile.
