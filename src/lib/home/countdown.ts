const BERLIN_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** gameDayDate is a @db.Date (UTC midnight); "today" is the Berlin calendar day of `now`. */
export function daysUntil(gameDayDate: Date, now: Date): number {
  const today = Date.parse(`${BERLIN_DATE.format(now)}T00:00:00Z`);
  return Math.round((gameDayDate.getTime() - today) / DAY_MS);
}

export function countdownLabel(days: number): string {
  if (days < 0) return "überfällig";
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}
