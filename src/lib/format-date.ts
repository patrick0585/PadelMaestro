// All German date output lives here. Game-day dates are stored at UTC midnight and formatted
// in UTC; instants (invitation expiry, chart ticks) use Europe/Berlin. Keep both explicit:
// the output must match between server and browser to avoid hydration mismatches.

type Zone = "UTC" | "Europe/Berlin";

const GAME_DAY_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const GAME_DAY_DATE_LONG = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const GAME_DAY_HEADING = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_MONTH: Record<Zone, Intl.DateTimeFormat> = {
  UTC: new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
  "Europe/Berlin": new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }),
};

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** "Fr., 09.10.2026" */
export const formatGameDayDate = (date: Date): string => GAME_DAY_DATE.format(date);

/** "Fr., 9. Oktober" */
export const formatGameDayDateLong = (date: Date): string => GAME_DAY_DATE_LONG.format(date);

/** "Fr., 9. Oktober 2026" */
export const formatGameDayHeading = (date: Date): string => GAME_DAY_HEADING.format(date);

/** "09.10." style day and month, UTC by default (game days), Berlin for real instants. */
export const formatDayMonth = (date: Date, timeZone: Zone = "UTC"): string => DAY_MONTH[timeZone].format(date);

export function dateBlockOf(date: Date): { day: string; month: string } {
  return { day: String(date.getUTCDate()).padStart(2, "0"), month: MONTHS[date.getUTCMonth()] };
}
