export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Textfassung zuerst; HTML entsteht daraus: je Absatz ein <p>, die Link-Zeile wird zum Anker.
function build(
  subject: string,
  name: string,
  paragraphs: string[],
  link?: string,
): MailContent {
  const blocks = [`Hallo ${name},`, ...paragraphs, "Dein Padelmaestro"];
  const text = blocks.join("\n\n");
  const html = blocks
    .map((b) => {
      const safe = escapeHtml(b);
      if (link && b === link) {
        return `<p><a href="${escapeHtml(link)}">${safe}</a></p>`;
      }
      return `<p>${safe.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
  return { subject, text, html };
}

export function verifyEmailMail(p: { name: string; link: string }): MailContent {
  return build(
    "Bitte bestätige deine E-Mail-Adresse",
    p.name,
    [
      "bitte bestätige deine E-Mail-Adresse über diesen Link. Er ist 24 Stunden gültig:",
      p.link,
      "Falls du dich nicht bei Padelmaestro registriert hast, kannst du diese Nachricht ignorieren.",
    ],
    p.link,
  );
}

export function passwordResetMail(p: { name: string; link: string }): MailContent {
  return build(
    "Passwort zurücksetzen",
    p.name,
    [
      "über diesen Link kannst du ein neues Passwort setzen. Er ist 1 Stunde gültig:",
      p.link,
      "Falls du das nicht angefordert hast, kannst du diese Nachricht ignorieren. Dein Passwort bleibt dann unverändert.",
    ],
    p.link,
  );
}

export function emailChangedMail(p: { name: string; newEmail: string }): MailContent {
  return build("Deine E-Mail-Adresse wurde geändert", p.name, [
    `die E-Mail-Adresse deines Kontos wurde auf ${p.newEmail} geändert.`,
    "Falls du das nicht warst, melde dich bitte beim Admin deiner Gruppe.",
  ]);
}
