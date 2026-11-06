import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Hilfe & Support – Padelmaestro" };

const MAIL = "kowalik.patrick@shoogee.com";

export default function SupportPage() {
  return (
    <LegalPage title="Hilfe & Support" updatedAt="2026-11-06">
      <p>
        Padelmaestro organisiert eure Padel-Runde: Spieltage planen, Zusagen sammeln, Ergebnisse am Platz eintragen und
        die Saison-Rangliste verfolgen. Hier findest du Antworten auf häufige Fragen.
      </p>

      <h2>Wie komme ich in eine Gruppe?</h2>
      <p>
        Gruppen sind privat. Ein Admin deiner Gruppe schickt dir einen Einladungslink. Öffne ihn, lege dein Konto an
        und du bist dabei.
      </p>

      <h2>Wie starte ich meine eigene Runde?</h2>
      <p>
        Tippe auf der Anmeldeseite auf „Neu hier? Konto erstellen“. Nach der Registrierung wählst du „Gruppe
        gründen“, gibst deiner Runde einen Namen und lädst deine Mitspieler über einen Einladungslink ein.
      </p>

      <h2>Ich habe mein Passwort vergessen</h2>
      <p>
        Tippe auf der Anmeldeseite auf „Passwort vergessen?“. Du bekommst einen Link an deine E-Mail-Adresse, der
        eine Stunde gültig ist. Dafür muss im Profil eine bestätigte E-Mail-Adresse hinterlegt sein.
      </p>

      <h2>Anmelden mit Apple</h2>
      <p>
        Du kannst dich auch mit „Mit Apple anmelden“ registrieren und anmelden, ganz ohne Passwort. Hast du schon ein
        Konto mit derselben E-Mail-Adresse, wird es verbunden, sobald die Adresse bestätigt ist. Sonst melde dich einmal
        mit Passwort an und verbinde Apple im Profil. Wenn du Apples „E-Mail-Adresse verbergen“ nutzt, kommen unsere
        Mails über die Weiterleitung von Apple bei dir an. Beim Löschen des Kontos wird die Verbindung zu Apple
        ebenfalls beendet.
      </p>

      <h2>Wie trage ich Ergebnisse ein?</h2>
      <p>
        Während ein Spieltag läuft, zeigt die Seite „Spieltag“ das aktuelle Match als Anzeigetafel. Tippe auf die
        Hälfte des Teams, das einen Punkt gemacht hat. Ist das Ergebnis eindeutig, speichert die App es nach zwei
        Sekunden selbst. Ein falsches Ergebnis korrigierst du durch Antippen in der Liste „Gewertet“.
      </p>

      <h2>Was ist ein Joker?</h2>
      <p>
        Kannst du an einem Spieltag nicht, setzt du einen Joker. Du bekommst dann Punkte nach deinem bisherigen
        Schnitt gutgeschrieben. Wie viele Joker es pro Saison gibt, legt deine Gruppe fest.
      </p>

      <h2>Benachrichtigungen</h2>
      <p>
        Die App erinnert dich an neue Spieltage und meldet das Ergebnis, wenn ein Spieltag beendet ist. Ein- und
        ausschalten kannst du das im Profil und in den Einstellungen deines iPhones.
      </p>

      <h2>Meine Daten exportieren oder das Konto löschen</h2>
      <p>
        Im <Link href="/profil">Profil</Link> unter „Konto“ kannst du alle deine Daten herunterladen oder dein Konto
        dauerhaft löschen. Wie wir mit deinen Daten umgehen, steht in der <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>

      <h2>Kontakt</h2>
      <p>
        Du hast eine Frage, einen Fehler gefunden oder eine Idee? Schreib uns an{" "}
        <a href={`mailto:${MAIL}`}>{MAIL}</a>. Wir antworten in der Regel innerhalb weniger Tage.
      </p>
    </LegalPage>
  );
}
