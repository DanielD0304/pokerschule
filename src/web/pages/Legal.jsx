// Rechtstexte. Die gelb markierten Platzhalter müssen vor dem öffentlichen Betrieb ausgefüllt werden.
const Ph = ({ children }) => <mark className="ph">{children}</mark>;

export function Impressum() {
  return (
    <div className="legal">
      <h1>Impressum</h1>
      <p>Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>
      <p><Ph>[Vorname Nachname]</Ph><br /><Ph>[Straße Hausnummer]</Ph><br /><Ph>[PLZ Ort]</Ph><br />Deutschland</p>
      <p>E-Mail: <Ph>[E-Mail-Adresse]</Ph></p>
      <p>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: <Ph>[Vorname Nachname, Anschrift wie oben]</Ph></p>
      <p className="muted">Die Pokerschule ist ein privates, nicht kommerzielles Lernprojekt. Es werden keine Glücksspiele veranstaltet oder vermittelt.</p>
    </div>
  );
}

export function Datenschutz() {
  return (
    <div className="legal">
      <h1>Datenschutzerklärung</h1>
      <h2>Verantwortlich</h2>
      <p>Verantwortlich im Sinne der DSGVO ist die im Impressum genannte Person.</p>
      <h2>Welche Daten die Website verarbeitet</h2>
      <p>Ohne Konto speichert die Pokerschule deinen Lernfortschritt (Ratings, Statistiken, gespeicherte Fehler) ausschließlich im lokalen Speicher deines Browsers (<code>localStorage</code>). Diese Daten verlassen dein Gerät nicht. Es gibt keine Cookies, kein Tracking und keine Analysewerkzeuge. Schriften und alle anderen Bestandteile werden von dieser Website selbst ausgeliefert.</p>
      <p>Wenn du deinen Fortschritt als Datei exportierst, entsteht diese Datei nur auf deinem Gerät.</p>
      <h2>Konto (freiwillig)</h2>
      <p>Wenn du ein Konto anlegst, verarbeiten wir:</p>
      <ul>
        <li><b>E-Mail-Adresse</b>, um dir Anmeldelinks zu schicken und dein Konto zu erkennen. Bei Anmeldung mit Apple oder Google erhalten wir von dort deine E-Mail-Adresse und eine Kennung, keine weiteren Profildaten.</li>
        <li><b>Lernfortschritt</b>: den Speicherstand (Ratings, Statistiken, gespeicherte Fehler, Einstellungen) und jede bewertete Entscheidung mit Modus, Situation, Einstufung, EV-Verlust und Zeitpunkt.</li>
        <li><b>Profil</b>: einen selbst gewählten Anzeigenamen und Avatar sowie deine Ratings. Öffentlich sichtbar ist das Profil nur, wenn du es einschaltest.</li>
      </ul>
      <p>Wir erheben keinen Klarnamen, kein Geburtsdatum und keine Zahlungsdaten. Zweck ist, deinen Fortschritt auf mehreren Geräten bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO, Nutzungsvertrag). Beim Anlegen bestätigst du, mindestens 18 Jahre alt zu sein.</p>
      <p>Die Daten liegen bei <Ph>[Supabase, Inc., 970 Toa Payoh North #07-04, Singapur 318992]</Ph> in einem Rechenzentrum in der EU (Frankfurt am Main). Mit Supabase besteht ein Auftragsverarbeitungsvertrag; für mögliche Zugriffe aus Drittländern gelten <Ph>[Standardvertragsklauseln / Angaben prüfen]</Ph>. Damit du angemeldet bleibst, legt die Website ein Anmelde-Token im lokalen Speicher deines Browsers ab.</p>
      <p><b>Speicherdauer und Löschung:</b> Die Daten bleiben gespeichert, bis du dein Konto löschst. Unter „Konto“ kannst du jederzeit alle Kontodaten als Datei herunterladen und das Konto selbst löschen. Dabei werden alle Daten sofort entfernt; Sicherungskopien des Anbieters laufen nach spätestens 30 Tagen aus.</p>
      <h2>Hosting</h2>
      <p>Die Website wird über <Ph>[Hosting-Anbieter, z. B. Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA, oder Netlify, Inc.]</Ph> ausgeliefert. Beim Abruf verarbeitet der Anbieter technisch notwendige Daten wie deine IP-Adresse, Datum und Uhrzeit und die abgerufene Datei in Server-Logs. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; das berechtigte Interesse liegt in der sicheren und stabilen Auslieferung der Website. Mit dem Anbieter besteht <Ph>[ein Auftragsverarbeitungsvertrag / Angaben zur Übermittlung in Drittländer]</Ph>. Einzelheiten stehen in der Datenschutzerklärung des Anbieters.</p>
      <h2>Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde. Deine lokal gespeicherten Daten löschst du jederzeit selbst unter „Statistik“ → „Fortschritt zurücksetzen“ oder über die Einstellungen deines Browsers.</p>
      <p className="muted">Stand: <Ph>[Datum]</Ph></p>
    </div>
  );
}

export function Lizenz() {
  return (
    <div className="legal">
      <h1>Lizenz</h1>
      <p>Copyright © 2026 Daniel Daenecke. Alle Rechte vorbehalten.</p>
      <p>Die Schrift JetBrains Mono steht unter der SIL Open Font License 1.1; der Lizenztext wird unter <a href="/fonts/OFL-JetBrainsMono.txt">/fonts/OFL-JetBrainsMono.txt</a> mit ausgeliefert. Für alle anderen Texte nutzt die Website die Systemschrift deines Geräts.</p>
    </div>
  );
}
