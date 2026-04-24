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

export const ATTENDANCE_GENERIC_ERROR =
  "Teilnahme konnte nicht gespeichert werden. Bitte erneut versuchen.";
