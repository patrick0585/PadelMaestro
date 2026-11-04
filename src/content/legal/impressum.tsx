// Echte Texte: nur h2/h3/p/ul/ol/a/strong verwenden, keine Farbklassen; PLACEHOLDER auf false setzen und updatedAt aktualisieren.
export const title = "Impressum";
export const updatedAt = "2026-11-04";
export const PLACEHOLDER: boolean = false;

export default function Content() {
  return (
    <>
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>Patrick Kowalik</p>
      <p>Graute Kamp 61, 48324 Sendenhorst</p>
      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:kowalik.patrick@shoogee.com">kowalik.patrick@shoogee.com</a>
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
