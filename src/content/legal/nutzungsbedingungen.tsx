// Echte Texte: nur h2/h3/p/ul/ol/a/strong verwenden, keine Farbklassen; PLACEHOLDER auf false setzen und updatedAt aktualisieren.
export const title = "Nutzungsbedingungen";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">
        ENTWURF – noch nicht freigegeben. Vor dem Beta-Start prüfen und PLACEHOLDER auf false setzen.
      </p>

      <h2>1. Zweck und Geltung</h2>
      <p>
        Padelmaestro (<a href="https://padelmaestro.de">padelmaestro.de</a>) hilft privaten Padel-Spielgruppen, Spieltage
        zu organisieren, Ergebnisse zu erfassen und Ranglisten zu sehen. Betrieben wird die App von der im{" "}
        <a href="/impressum">Impressum</a> genannten Privatperson. Diese Bedingungen gelten für die gesamte Nutzung der
        App. Mit der Registrierung stimmst du ihnen zu.
      </p>

      <h2>2. Dein Konto</h2>
      <ul>
        <li>Du darfst nur ein Konto anlegen, und zwar für dich selbst.</li>
        <li>Du musst mindestens 16 Jahre alt sein.</li>
        <li>Deine Angaben, vor allem Name und E-Mail-Adresse, müssen stimmen.</li>
        <li>
          Halte dein Passwort geheim. Wenn du vermutest, dass jemand anderes Zugriff hat, ändere es sofort und gib dem
          Betreiber Bescheid.
        </li>
      </ul>

      <h2>3. Gruppen und Rollen</h2>
      <p>
        Ein Konto entsteht über den Einladungslink einer Gruppe. Jede Gruppe hat einen Besitzer; Besitzer und Admins
        verwalten die Mitglieder, Spieltage und Einladungen ihrer Gruppe.
      </p>
      <ul>
        <li>Teile Einladungslinks nur mit Personen, die du in der Gruppe haben willst, und nicht öffentlich.</li>
        <li>
          Der Besitzer einer Gruppe trägt die Verantwortung für seine Gruppe und das, was dort
          eingetragen wird.
        </li>
      </ul>

      <h2>4. Zulässige Nutzung</h2>
      <p>Padelmaestro ist für private Spielgruppen gedacht. Nicht erlaubt ist insbesondere:</p>
      <ul>
        <li>die Nutzung für gewerbliche Zwecke,</li>
        <li>Konten oder Einträge für andere Personen ohne deren Wissen anzulegen,</li>
        <li>
          Angriffe auf den Dienst, etwa Versuche, Sicherheitsmaßnahmen zu umgehen, fremde Konten zu nutzen oder den
          Server zu überlasten.
        </li>
      </ul>

      <h2>5. Inhalte</h2>
      <p>
        Ergebnisse, Namen und Profilbilder, die du einträgst oder hochlädst, sind für die Mitglieder deiner Gruppe
        sichtbar. Du bist für deine Einträge verantwortlich und lädst nur Bilder hoch, an denen du die nötigen Rechte
        hast. Der Betreiber nutzt deine Inhalte nur, um die App bereitzustellen, und für nichts anderes. Details stehen
        in der <a href="/datenschutz">Datenschutzerklärung</a>.
      </p>

      <h2>6. Verfügbarkeit</h2>
      <p>
        Padelmaestro ist kostenlos und befindet sich im Beta-Betrieb. Es gibt keine Garantie, dass die App jederzeit
        erreichbar ist oder fehlerfrei funktioniert. Funktionen können sich ändern. Der Betreiber kann den Dienst auch
        ganz einstellen; das wird mit angemessenem Vorlauf angekündigt. Du kannst deine Daten jederzeit im Profil über
        „Daten exportieren“ herunterladen.
      </p>

      <h2>7. Haftung</h2>
      <p>
        Der Betreiber haftet unbeschränkt für Vorsatz und grobe Fahrlässigkeit. Bei leichter Fahrlässigkeit haftet er
        nur, wenn eine wesentliche Vertragspflicht verletzt wird, und dann begrenzt auf den vorhersehbaren, typischen
        Schaden. Wesentlich sind Pflichten, deren Erfüllung die Nutzung der App überhaupt erst ermöglicht und auf die du
        vertrauen darfst. Die gesetzliche Haftung für Schäden an Leben, Körper und Gesundheit bleibt unberührt.
      </p>

      <h2>8. Beendigung</h2>
      <p>
        Du kannst dein Konto jederzeit im Profil über „Konto löschen“ löschen. Bist du Besitzer einer Gruppe, musst du
        vorher den Besitz übertragen oder die Gruppe löschen.
      </p>
      <p>
        Bei Missbrauch oder einem Verstoß gegen diese Bedingungen kann der Betreiber dein Konto nach einem Hinweis
        sperren oder löschen.
      </p>

      <h2>9. Änderungen der Bedingungen</h2>
      <p>
        Wenn sich diese Bedingungen ändern, wirst du in der App oder per E-Mail darauf hingewiesen. Nutzt du die App
        danach weiter, gilt das als Zustimmung zu den geänderten Bedingungen. Bist du nicht einverstanden, kannst du
        dein Konto löschen.
      </p>

      <h2>10. Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen Bestimmungen wirksam.
      </p>
    </>
  );
}
