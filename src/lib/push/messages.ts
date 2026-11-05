import type { PushMessage } from "./send";
import { startTimeMinutes } from "@/lib/game-day/start-time";

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

const atTime = (startTime?: string | null) => (startTime ? ` um ${startTime} Uhr` : "");

export function newGameDayMessage(
  groupName: string,
  date: Date,
  startTime?: string | null,
): Pick<PushMessage, "title" | "body"> {
  const weekday = WEEKDAYS[date.getUTCDay()];
  const day = `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.`;
  return { title: "Neuer Spieltag", body: `${groupName}: ${weekday}, ${day}${atTime(startTime)} – bist du dabei?` };
}

const firstName = (name: string) => name.split(" ")[0];
const punkte = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkten"}`;
const punkteNom = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`;

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}

export interface FinishedRecipient {
  playerId: string;
  rank: number;
  points: number;
  joker: boolean;
}

/** Personal end-of-day text; `me` is null for members who neither played nor used a joker. */
export function gameDayFinishedMessage(
  groupName: string,
  winners: { playerId: string; name: string }[],
  winnerPoints: number,
  me: FinishedRecipient | null,
): Pick<PushMessage, "title" | "body"> {
  const title = "Spieltag beendet";
  const names = winners.map((w) => firstName(w.name));
  const verb = winners.length > 1 ? "gewinnen" : "gewinnt";
  const result = `${joinNames(names)} ${verb} mit ${punkte(winnerPoints)}.`;
  if (me && !me.joker && winners.some((w) => w.playerId === me.playerId)) {
    const others = winners.filter((w) => w.playerId !== me.playerId).map((w) => firstName(w.name));
    const body =
      others.length === 0
        ? `Du gewinnst den Spieltag mit ${punkte(winnerPoints)}!`
        : `Du gewinnst gemeinsam mit ${joinNames(others)} – ${punkteNom(winnerPoints)}!`;
    return { title, body: `${groupName}: ${body}` };
  }
  if (me?.joker) {
    return { title, body: `${groupName}: Ohne dich: ${result} Dein Joker bringt ${punkteNom(me.points)}.` };
  }
  if (me) return { title, body: `${groupName}: ${result} Du wirst ${me.rank}. mit ${me.points}.` };
  return { title, body: `${groupName}: ${result}` };
}

export function reminderMessage(
  kind: ReminderKind,
  groupName: string,
  startTime?: string | null,
): Pick<PushMessage, "title" | "body"> {
  const when = `${kind === "day_before" ? "morgen" : "heute"}${atTime(startTime)} ist Spieltag`;
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

function berlinWallTime(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(year, month, day, hour, minute);
  const first = guess - berlinOffsetMs(guess);
  return new Date(guess - berlinOffsetMs(first));
}

const SAME_DAY_DEFAULT = 14 * 60;
const SAME_DAY_EARLIEST = 7 * 60;
const SAME_DAY_LEAD = 3 * 60;
const SAME_DAY_MIN_LEAD = 60;

/**
 * gameDayDate is a @db.Date (UTC midnight of the calendar day).
 * Same-day reminder: 14:00, or 3 h before an earlier kickoff (not before 07:00);
 * null when that would be less than 1 h before kickoff.
 */
export function reminderTime(
  kind: ReminderKind,
  gameDayDate: Date,
  startTime?: string | null,
): Date | null {
  const y = gameDayDate.getUTCFullYear();
  const m = gameDayDate.getUTCMonth();
  const d = gameDayDate.getUTCDate();
  if (kind === "day_before") return berlinWallTime(y, m, d - 1, 18);
  const kickoff = startTime ? startTimeMinutes(startTime) : null;
  const latest = kickoff === null ? SAME_DAY_DEFAULT : kickoff - SAME_DAY_LEAD;
  const minutes = Math.max(SAME_DAY_EARLIEST, Math.min(SAME_DAY_DEFAULT, latest));
  if (kickoff !== null && minutes > kickoff - SAME_DAY_MIN_LEAD) return null;
  return berlinWallTime(y, m, d, Math.floor(minutes / 60), minutes % 60);
}
