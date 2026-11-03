// Echte Texte: nur h2/h3/p/ul/ol/a/strong verwenden, keine Farbklassen; PLACEHOLDER auf false setzen und updatedAt aktualisieren.
export const title = "Datenschutzerklärung";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">
        ENTWURF – noch nicht freigegeben. Vor dem Beta-Start prüfen und PLACEHOLDER auf false setzen.
      </p>
      <p>
        Diese Erklärung beschreibt, welche personenbezogenen Daten bei der Nutzung von Padelmaestro (
        <a href="https://padelmaestro.de">padelmaestro.de</a>) verarbeitet werden. Padelmaestro ist eine kostenlose
        Web-App im Beta-Betrieb, mit der private Padel-Spielgruppen Spieltage organisieren, Ergebnisse erfassen und
        Ranglisten einsehen.
      </p>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich ist die im <a href="/impressum">Impressum</a> genannte Person.
      </p>

      <h2>2. Hosting und Zugriffsprotokoll</h2>
      <p>
        Die App läuft auf einem virtuellen Server der IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, Deutschland
        [Anschrift des Hosters prüfen]. Das
        Rechenzentrum befindet sich in Deutschland. IONOS verarbeitet die Daten als Auftragsverarbeiter.
      </p>
      <p>Bei jedem Aufruf speichert der Webserver ein Zugriffsprotokoll mit folgenden Angaben:</p>
      <ul>
        <li>IP-Adresse</li>
        <li>Zeitpunkt des Zugriffs</li>
        <li>aufgerufene Adresse</li>
        <li>Statuscode der Antwort</li>
        <li>Browser-Kennung (User-Agent)</li>
      </ul>
      <p>[Felder mit der Server-Konfiguration abgleichen]</p>
      <p>
        Zweck sind die Betriebssicherheit und die Fehlersuche. Rechtsgrundlage ist das berechtigte Interesse an einem
        sicheren und funktionierenden Dienst (Art. 6 Abs. 1 lit. f DSGVO). Die Protokolle werden durch automatische
        Rotation nach spätestens 14 Tagen gelöscht [Frist prüfen].
      </p>

      <h2>3. Konto und Nutzung der App</h2>
      <p>
        Ein Konto kann nur über den Einladungslink einer Gruppe angelegt werden. Für Konto und Nutzung werden
        verarbeitet:
      </p>
      <ul>
        <li>Name und E-Mail-Adresse</li>
        <li>optional ein Benutzername und ein Profilbild</li>
        <li>das Passwort, gespeichert ausschließlich als Hash (bcrypt)</li>
        <li>der Zeitpunkt der Zustimmung zu den Nutzungsbedingungen</li>
        <li>Mitgliedschaften und Rollen in Gruppen</li>
        <li>Teilnahme an Spieltagen, Spielergebnisse und Joker-Nutzung</li>
        <li>die Nutzung von Einladungslinks</li>
      </ul>
      <p>
        Diese Daten sind nötig, um das Konto, die Gruppen und die Ergebnisse bereitzustellen. Rechtsgrundlage ist die
        Erfüllung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) [Rechtsgrundlage prüfen].
      </p>
      <h3>Audit-Protokoll</h3>
      <p>
        Die App protokolliert, welche Aktion wer wann ausgelöst hat, zum Beispiel das Eintragen oder Ändern eines
        Ergebnisses. Das dient der Nachvollziehbarkeit innerhalb der Gruppen und der Sicherheit. Rechtsgrundlage ist das
        berechtigte Interesse (Art. 6 Abs. 1 lit. f DSGVO).
      </p>
      <p>
        Wird ein Konto gelöscht, werden Einträge über diese Person anonymisiert. Bei Einträgen zu Aktionen, die die
        Person selbst ausgelöst hat, bleibt nur die Konto-ID erhalten. Die Einträge werden aufbewahrt, solange das
        Konto oder die Gruppe besteht [Aufbewahrung prüfen].
      </p>

      <h2>4. Sichtbarkeit innerhalb der Gruppe</h2>
      <p>
        Name, Profilbild, Spielergebnisse, Rangliste und Teilnahme an Spieltagen sind für die Mitglieder derselben
        Gruppe sichtbar. Besitzer und Admins einer Gruppe sehen zusätzlich die E-Mail-Adresse und den Benutzernamen der
        Mitglieder ihrer Gruppe. Für Personen außerhalb der Gruppe sind diese Daten nicht sichtbar.
      </p>

      <h2>5. E-Mail-Versand</h2>
      <p>
        E-Mails werden nur verschickt, wenn sie für die Nutzung nötig sind: zur Bestätigung der E-Mail-Adresse, zum
        Zurücksetzen des Passworts und als Hinweis bei einer Änderung der E-Mail-Adresse. Es gibt keinen Newsletter und
        keine Werbung.
      </p>
      <p>
        Für den Versand wird Resend genutzt (Resend Inc., 2261 Market Street #5039, San Francisco, CA 94114, USA).
        Übermittelt werden Empfängeradresse, Name und Inhalt der Mail. Als Verarbeitungsregion ist die EU (Irland)
        gewählt. Mit Resend besteht ein Auftragsverarbeitungsvertrag; für einen möglichen Zugriff aus den USA gelten die
        EU-Standardvertragsklauseln [Anschrift, Auftragsverarbeitungsvertrag und Standardvertragsklauseln prüfen].
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <h2>6. Cookies</h2>
      <p>
        Padelmaestro setzt nur ein technisch notwendiges Sitzungs-Cookie, das die Anmeldung speichert. Es ist als
        HttpOnly und Secure markiert und läuft nach 30 Tagen ab. Eine Einwilligung ist dafür nicht erforderlich (§ 25
        Abs. 2 Nr. 2 TDDDG [Paragraf prüfen]).
      </p>
      <p>
        Es werden keine Analyse-, Tracking- oder Werbetools eingesetzt und keine Inhalte Dritter eingebettet. Schriften
        werden vom eigenen Server ausgeliefert.
      </p>

      <h2>7. Empfänger</h2>
      <p>
        Außerhalb deiner Gruppen (siehe Abschnitt 4) werden Daten nur an die genannten Dienstleister IONOS und Resend
        weitergegeben. Ein Verkauf findet nicht statt. Automatisierte Entscheidungen im Einzelfall finden nicht statt.
      </p>

      <h2>8. Speicherdauer</h2>
      <ul>
        <li>Kontodaten werden gespeichert, solange das Konto besteht.</li>
        <li>
          Nach dem Löschen eines Kontos bleiben Spielergebnisse anonymisiert erhalten, damit Ranglisten und Spieltage der
          anderen Mitglieder stimmen. Statt des Namens erscheint dann „Gelöschter Spieler“.
        </li>
        <li>Zugriffsprotokolle werden nach spätestens 14 Tagen gelöscht [Frist prüfen] (siehe Abschnitt 2).</li>
        <li>
          Links zur Bestätigung der E-Mail-Adresse gelten 24 Stunden, Links zum Zurücksetzen des Passworts 1 Stunde.
        </li>
      </ul>

      <h2>9. Rechte der Betroffenen</h2>
      <p>Betroffene haben folgende Rechte, die sich zum großen Teil direkt im Profil ausüben lassen:</p>
      <ul>
        <li>
          <strong>Auskunft und Datenübertragbarkeit</strong> (Art. 15, 20 DSGVO): über „Daten exportieren“ im Profil als
          JSON-Datei.
        </li>
        <li>
          <strong>Berichtigung</strong> (Art. 16 DSGVO): Name, E-Mail-Adresse, Benutzername und Profilbild lassen sich im
          Profil ändern.
        </li>
        <li>
          <strong>Löschung</strong> (Art. 17 DSGVO): über „Konto löschen“ im Profil. Dein Name und deine Kontodaten
          werden gelöscht; Spielergebnisse bleiben ohne Personenbezug erhalten. Solange jemand Besitzer einer Gruppe ist, ist das Löschen gesperrt; vorher muss
          der Besitz übertragen oder die Gruppe gelöscht werden.
        </li>
        <li>
          <strong>Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO): auf Anfrage per E-Mail.
        </li>
        <li>
          <strong>Widerspruch</strong> (Art. 21 DSGVO) gegen Verarbeitungen, die auf berechtigtem Interesse beruhen.
        </li>
        <li>
          <strong>Beschwerde</strong> bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO), etwa der Behörde des
          eigenen Wohnorts.
        </li>
      </ul>
      <p>
        Für alle Anliegen genügt eine E-Mail an die im <a href="/impressum">Impressum</a> genannte Adresse.
      </p>

      <h2>10. Mindestalter</h2>
      <p>Ein Konto darf erst ab 16 Jahren angelegt werden.</p>

      <h2>11. Änderungen</h2>
      <p>
        Diese Erklärung wird angepasst, wenn sich die App oder die Rechtslage ändert. Es gilt die jeweils hier
        veröffentlichte Fassung.
      </p>
    </>
  );
}
