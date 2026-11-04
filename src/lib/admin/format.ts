export function formatGameDayDate(date: Date): string {
  return date.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
