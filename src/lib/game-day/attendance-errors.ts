export type AttendanceErrorCode =
  | "ATTENDANCE_LOCKED"
  | "ATTENDANCE_NOT_PARTICIPANT"
  | "ATTENDANCE_GAME_DAY_NOT_FOUND";

export const ATTENDANCE_ERROR_MESSAGES: Record<AttendanceErrorCode, string> = {
  ATTENDANCE_LOCKED:
    "Spieltag ist bereits gestartet — Teilnahme kann nicht mehr geändert werden.",
  ATTENDANCE_NOT_PARTICIPANT:
    "Du bist nicht Teilnehmer dieses Spieltags. Bitte den Admin, dich aufzunehmen.",
  ATTENDANCE_GAME_DAY_NOT_FOUND:
    "Dieser Spieltag existiert nicht mehr. Bitte Seite neu laden.",
};

// Shown when the server returns an HTTP status we don't have a specific message
// for (e.g. 401 session expired, 500 server error) or when the request fails
// before reaching the server (network drop). Mobile browsers drop the session
// cookie silently; surfacing the status lets the user act (re-login) instead of
// retrying blindly.
export function genericAttendanceError(status: number): string {
  if (status === 401) {
    return "Deine Sitzung ist abgelaufen. Bitte einmal ausloggen und neu einloggen.";
  }
  if (status === 0) {
    return "Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.";
  }
  return `Teilnahme konnte nicht gespeichert werden (Fehler ${status}). Bitte erneut versuchen.`;
}

export function genericJokerError(status: number): string {
  if (status === 401) {
    return "Deine Sitzung ist abgelaufen. Bitte einmal ausloggen und neu einloggen.";
  }
  if (status === 0) {
    return "Keine Verbindung. Bitte Internetverbindung prüfen und erneut versuchen.";
  }
  return `Joker konnte nicht gespeichert werden (Fehler ${status}). Bitte erneut versuchen.`;
}
