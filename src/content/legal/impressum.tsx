export const title = "Impressum";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">PLATZHALTER – Text folgt vor dem Beta-Start.</p>
      <h2>Anbieter</h2>
      <p className="text-foreground-muted">Name und Anschrift des Betreibers.</p>
      <h2>Kontakt</h2>
      <p className="text-foreground-muted">E-Mail-Adresse für Anfragen.</p>
      <h2>Verantwortlich</h2>
      <p className="text-foreground-muted">Verantwortliche Person für den Inhalt.</p>
    </>
  );
}
