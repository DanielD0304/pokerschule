# Online-Spiel einrichten (Supabase)

Anleitung zu Roadmap [02 · Online-Spiel gegen Menschen](roadmap/02-online-spiel.md). Voraussetzung sind eingerichtete Konten ([konten-einrichten.md](konten-einrichten.md)). Ohne die Schritte hier erscheint die Online-Seite zwar, die Suche nach Gegnern scheitert aber mit einer Fehlermeldung.

## 1. Datenbank

Die Migration `supabase/migrations/20261010000000_online.sql` legt Warteschlange, Matches, die Sicht je Platz, den geheimen Spielzustand, Einladungen, Meldungen und Fair-Play-Daten an, jeweils mit Row Level Security, und nimmt `match_seats` in die Realtime-Publikation auf.

```bash
npx supabase db push
npx supabase test db     # lokal, braucht Docker: prüft auch supabase/tests/database/online.test.sql
```

Ohne CLI: den Inhalt der Migration im *SQL Editor* ausführen. Danach unter *Database → Publications → supabase_realtime* prüfen, dass `match_seats` aktiviert ist.

## 2. Edge Function

Der Server ist die Edge Function `supabase/functions/online`. Sie rechnet mit derselben Kernlogik wie die Website; eine Kopie davon und der nötigen Solver-Daten liegt in `supabase/functions/_shared`. Nach jeder Änderung an `src/core` oder `public/data`:

```bash
npm run functions:sync
```

Die Tests schlagen fehl, wenn die Kopie veraltet ist. Bereitstellen:

```bash
npx supabase functions deploy online
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase in Edge Functions automatisch. Optional `ALLOWED_ORIGIN` (z. B. `https://pokerschule.vercel.app`) unter *Edge Functions → Secrets*, sonst erlaubt die Funktion Aufrufe von jeder Herkunft (geschützt ist sie trotzdem durch das Anmelde-Token). Die Region der Function möglichst auf Frankfurt legen, damit eine Aktion unter 300 ms bleibt.

Lokal testen:

```bash
npx supabase start
npx supabase functions serve online
```

## 3. Betrieb

- **Meldungen** stehen in der Tabelle `reports` (Dashboard → *Table Editor*).
- **Fair Play:** `fair_play.flag` setzt der Server automatisch, wenn jemand über mindestens zehn Matches fast fehlerfrei und mit auffällig gleichmäßiger Bedenkzeit spielt. Das sperrt nicht. Sperren: `fair_play.banned = true` für das Konto setzen (Zeile ggf. anlegen); gesperrte Konten können keine Matches mehr beginnen.
- **Kosten:** Im Free-Tarif sind 200 gleichzeitige Realtime-Verbindungen und 500 000 Function-Aufrufe im Monat enthalten. Ein Push/Fold-Match braucht etwa 20 bis 60 Aufrufe (Aktionen, Warteschlange alle 4 Sekunden, Ablauf der Bedenkzeit).

## So funktioniert ein Match

| Was | Wo | Wer liest |
|---|---|---|
| Warteschlange, Einladungen | `online_queue`, `challenges` | nur der Server |
| Spielzustand mit Deck, Salt und allen Karten | `match_secrets.state` | nur der Server |
| Sicht eines Platzes: eigene Karten, öffentliche Aktionen, Uhr | `match_seats.view` | nur dieser Spieler, per Realtime |
| Match-Liste, nach dem Ende die vollständige Analyse | `matches` | beide Spieler |
| Online-Rating, Bilanz | `profiles.online` | wie das Profil (öffentlich, wenn eingeschaltet) |

Ablauf einer Aktion: Browser → `online` (Aktion prüfen, Zustand fortschreiben, ggf. neu mischen) → `online_save` speichert Zustand und beide Sichten in einem Schritt, nur wenn seit dem Lesen niemand anderes geschrieben hat → Realtime meldet die neue Sicht an beide Browser.

**Mischen:** `crypto.getRandomValues` mit Verwerfen ungleich verteilter Werte, Fisher-Yates. Vor jeder Hand steht in der Sicht der SHA-256 von `salt:deck`; nach dem Match liegen Deck und Salt offen, und die Analyse-Seite prüft im Browser nach (`verifyRecord` in `src/core/online.js`).

**Zeit:** 20 Sekunden je Entscheidung, danach läuft die Zeitbank (30 Sekunden je Match). Ist beides abgelaufen, melden die Browser das dem Server, der selbst nachprüft und für den Spieler foldet. Jeder Browser sendet alle 15 Sekunden ein Lebenszeichen (`match_ping`); wer länger als 60 Sekunden fehlt, hat das Match aufgegeben.

**Rating** (`src/core/online.js`): Für jede Entscheidung beider Spieler wird der EV-Verlust gegen das Gleichgewicht berechnet (Push/Fold: Nash bei effektivem Stack; Duell: gelöster Preflop-Baum, Range des Gegners aus seinen Aktionen). Spielqualität = EV-Verlust in BB pro 100 Entscheidungen. Wertung für Spieler A = 1 / (1 + 10^((qA − qB) / 40)), bei weniger als 8 Entscheidungen je Spieler zur Mitte hin abgeschwächt. Daraus Elo mit K = 40 in den ersten 10 Matches, danach 20. Aufgeben oder Verbindungsabbruch zählt als 0. Das Chip-Ergebnis wird angezeigt, zählt aber nicht.
