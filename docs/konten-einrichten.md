# Konten einrichten (Supabase)

Anleitung zu Roadmap [01 · Konten und Synchronisierung](roadmap/01-konten-und-sync.md). Ohne diese Schritte läuft die Website wie bisher ohne Konten; die Seite „Konto“ zeigt dann nur einen Hinweis.

## 1. Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen, **Region: Central EU (Frankfurt)**.
2. Unter *Project Settings → API* die **Project URL** und den **anon public key** kopieren.
3. Datenschutz: unter *Organization → Legal Documents* den Auftragsverarbeitungsvertrag (DPA) abschließen. Bei Vercel ebenso.

## 2. Datenbank

Die Migration legt die Tabellen `profiles`, `progress` und `decisions` mit Row Level Security an, dazu die Funktion `delete_account()`.

```bash
npx supabase login
npx supabase link --project-ref <projekt-ref>
npx supabase db push
```

Ohne CLI geht es auch: den Inhalt von `supabase/migrations/20261009000000_konten.sql` im Dashboard unter *SQL Editor* ausführen.

Die Sicherheitsregeln testen (lokal, braucht Docker):

```bash
npx supabase start
npx supabase test db
```

## 3. Anmeldung

Unter *Authentication*:

- **URL Configuration:** *Site URL* `https://pokerschule.vercel.app`; unter *Redirect URLs* zusätzlich `https://pokerschule.vercel.app/konto` und `http://localhost:5173/konto` eintragen.
- **Providers → Email:** aktiviert lassen, „Confirm email“ an. Passwort-Anmeldung wird von der Website nicht genutzt.
- **Email Templates → Magic Link:** damit die Code-Eingabe auf der Website funktioniert (praktisch, wenn der Link auf einem anderen Gerät geöffnet wird), den Code in die Mail aufnehmen, zum Beispiel:

  ```html
  <h2>Anmelden bei der Pokerschule</h2>
  <p><a href="{{ .ConfirmationURL }}">Jetzt anmelden</a></p>
  <p>Oder gib diesen Code ein: <b>{{ .Token }}</b></p>
  ```

  Dasselbe im Template *Confirm signup*.
- **SMTP:** Der eingebaute Mailversand ist auf wenige Mails pro Stunde begrenzt und nur zum Testen gedacht. Für den Betrieb unter *Project Settings → Authentication → SMTP* einen eigenen Anbieter eintragen (z. B. Brevo, Postmark, Amazon SES).
- **Apple / Google (optional):** unter *Providers* einrichten und danach `VITE_AUTH_PROVIDERS=google,apple` setzen.

## 4. Website konfigurieren

Lokal: `.env.example` nach `.env.local` kopieren und ausfüllen, dann `npm run dev`.

Vercel: unter *Project → Settings → Environment Variables* `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` und optional `VITE_AUTH_PROVIDERS` setzen und neu deployen. Der anon-Schlüssel landet im ausgelieferten JavaScript; das ist so vorgesehen, die Daten schützt Row Level Security.

## 5. Vor dem Start

- Platzhalter in der Datenschutzerklärung (`src/web/pages/Legal.jsx`, Abschnitt „Konto“) prüfen und ausfüllen; Rechtsberatung empfohlen.
- Auf zwei Geräten anmelden und prüfen, dass Ratings, Statistik und Fehlerliste übereinstimmen (Abnahmekriterium).
- Backups: Im Free-Tarif gibt es keine automatischen Backups. Ab dem Pro-Tarif tägliche Backups mit 7 Tagen Aufbewahrung; die Datenschutzerklärung nennt 30 Tage als Obergrenze.

## So funktioniert die Synchronisierung

| Was | Wo | Wie |
|---|---|---|
| Speicherstand (Schema v2) | `progress.data` | als Ganzes; Schreiben nur, wenn sich `version` seit dem Lesen nicht geändert hat, sonst neu lesen und zusammenführen |
| Entscheidungen | `decisions` | einzeln, mit auf dem Gerät erzeugter id; Warteschlange im Browser (`pokerschule.outbox`), doppeltes Hochladen wird ignoriert |
| Profil | `profiles` | Anzeigename, Avatar, öffentlich ja/nein; Ratings werden beim Synchronisieren aktualisiert |

Zusammenführen (`src/core/sync.js`): pro Bereich gewinnt der Stand mit mehr Entscheidungen, Fehlerlisten werden vereinigt, Tagesaktivität und Situations-Statistik pro Eintrag. Nach „Zurücksetzen“ oder „Laden“ bekommt der Stand eine neue Epoche und ersetzt dann den Stand im Konto und auf den anderen Geräten, statt zusammengeführt zu werden.

Beim ersten Verbinden eines Geräts mit Fortschritt fragt die Website nach und legt vorher eine Sicherung im Browser an (`pokerschule.sicherung`), die sich unter „Konto“ wiederherstellen lässt.

Ohne Netz speichert die Website weiter im Browser und synchronisiert, sobald wieder eine Verbindung besteht oder der Tab wieder sichtbar wird.
