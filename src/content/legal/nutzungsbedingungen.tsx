export const title = "Nutzungsbedingungen";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">PLATZHALTER – Text folgt vor dem Beta-Start.</p>
      <h2>Zweck</h2>
      <p className="text-foreground-muted">Wofür Padelmaestro gedacht ist.</p>
      <h2>Konto</h2>
      <p className="text-foreground-muted">Registrierung, Zugangsdaten und Verantwortung für das eigene Konto.</p>
      <h2>Verhalten</h2>
      <p className="text-foreground-muted">Regeln für den Umgang miteinander und die Eingabe von Ergebnissen.</p>
      <h2>Haftung</h2>
      <p className="text-foreground-muted">Umfang der Haftung des Betreibers.</p>
      <h2>Kündigung</h2>
      <p className="text-foreground-muted">Wie Konten gelöscht oder gesperrt werden können.</p>
    </>
  );
}
