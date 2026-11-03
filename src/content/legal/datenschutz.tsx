export const title = "Datenschutzerklärung";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">PLATZHALTER – Text folgt vor dem Beta-Start.</p>
      <h2>Verantwortlicher</h2>
      <p className="text-foreground-muted">Wer die Daten verarbeitet und wie man ihn erreicht (siehe Impressum).</p>
      <h2>Hosting</h2>
      <p className="text-foreground-muted">Betrieb auf einem IONOS-Server in Deutschland.</p>
      <h2>Mailversand</h2>
      <p className="text-foreground-muted">Mailversand über Resend (EU-Region, falls gewählt; Drittlandtransfer wird geprüft) für Transaktionsmails (Bestätigung, Passwort zurücksetzen, Änderungshinweis).</p>
      <h2>Gespeicherte Daten</h2>
      <p className="text-foreground-muted">Name, E-Mail-Adresse, Passwort-Hash, Spielergebnisse, Gruppenmitgliedschaften und Protokolleinträge.</p>
      <h2>Cookies</h2>
      <p className="text-foreground-muted">Nur ein Session-Cookie für die Anmeldung; keine Tracking- oder Analyse-Tools.</p>
      <h2>Betroffenenrechte</h2>
      <p className="text-foreground-muted">Auskunft, Berichtigung, Export und Löschung des Kontos direkt im Profil sowie Beschwerderecht.</p>
    </>
  );
}
