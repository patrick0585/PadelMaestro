// Echte Texte: nur h2/h3/p/ul/ol/a/strong verwenden, keine Farbklassen; PLACEHOLDER auf false setzen und updatedAt aktualisieren.
export const title = "Impressum";
export const updatedAt = "2026-11-03";
export const PLACEHOLDER: boolean = true;

export default function Content() {
  return (
    <>
      <p className="text-destructive font-semibold">
        ENTWURF – noch nicht freigegeben. Vor dem Beta-Start prüfen und PLACEHOLDER auf false setzen.
      </p>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>[VORNAME NACHNAME]</p>
      <p>[STRASSE HAUSNUMMER], [PLZ ORT]</p>
      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:[E-MAIL-ADRESSE]">[E-MAIL-ADRESSE]</a>
      </p>
      <h2>Hinweis</h2>
      <p>
        Diese App ist ein privates, nicht-kommerzielles Projekt. Padelmaestro (
        <a href="https://padelmaestro.de">padelmaestro.de</a>) hilft privaten Padel-Spielgruppen, Spieltage zu
        organisieren und Ergebnisse festzuhalten.
      </p>
    </>
  );
}
