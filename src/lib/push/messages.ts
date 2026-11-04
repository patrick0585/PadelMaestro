import type { PushMessage } from "./send";

export type ReminderKind = "day_before" | "same_day";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;
const BERLIN = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

const pad = (n: number) => String(n).padStart(2, "0");

export function newGameDayMessage(groupName: string, date: Date): Pick<PushMessage, "title" | "body"> {
  const weekday = WEEKDAYS[date.getUTCDay()];
  const day = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.`;
  return { title: "Neuer Spieltag", body: `${groupName}: ${weekday}, ${day} – bist du dabei?` };
}

export function reminderMessage(kind: ReminderKind, groupName: string): Pick<PushMessage, "title" | "body"> {
  const when = kind === "day_before" ? "morgen ist Spieltag" : "heute um 18 Uhr ist Spieltag";
  return { title: "Noch nicht abgestimmt", body: `${groupName}: ${when} – bist du dabei?` };
}

function berlinOffsetMs(instant: number): number {
  const p: Record<string, number> = {};
  for (const part of BERLIN.formatToParts(new Date(instant))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function berlinWallTime(year: number, month: number, day: number, hour: number): Date {
  const guess = Date.UTC(year, month, day, hour);
  const first = guess - berlinOffsetMs(guess);
  return new Date(guess - berlinOffsetMs(first));
}

/** gameDayDate is a @db.Date (UTC midnight of the calendar day). */
export function reminderTime(kind: ReminderKind, gameDayDate: Date): Date {
  const y = gameDayDate.getUTCFullYear();
  const m = gameDayDate.getUTCMonth();
  const d = gameDayDate.getUTCDate();
  return kind === "day_before" ? berlinWallTime(y, m, d - 1, 18) : berlinWallTime(y, m, d, 14);
}
