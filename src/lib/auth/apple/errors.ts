export type AppleErrorCode =
  | "apple_unavailable"
  | "apple_invalid_token"
  | "apple_email_unverified_account"
  | "apple_already_linked"
  | "signup_closed"
  | "invitation_invalid"
  | "rate_limited";

export const APPLE_ERROR_MESSAGES: Record<AppleErrorCode, string> = {
  apple_unavailable: "Anmeldung mit Apple ist gerade nicht verfügbar.",
  apple_invalid_token: "Die Anmeldung mit Apple hat nicht geklappt. Bitte versuche es erneut.",
  apple_email_unverified_account:
    "Für diese E-Mail gibt es schon ein Konto. Melde dich mit Passwort an und verbinde Apple im Profil.",
  apple_already_linked: "Diese Apple-ID ist bereits mit einem anderen Konto verbunden.",
  signup_closed: "Registrierung derzeit nur mit Einladung",
  invitation_invalid: "Dieser Einladungslink ist nicht mehr gültig.",
  rate_limited: "Zu viele Versuche. Bitte warte kurz.",
};

export class AppleAuthError extends Error {
  constructor(readonly code: AppleErrorCode) {
    super(code);
    this.name = "AppleAuthError";
  }
}
