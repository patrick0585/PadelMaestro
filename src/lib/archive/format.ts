export function formatGameDayDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function dateBlockOf(date: Date): { day: string; month: string } {
  return { day: String(date.getUTCDate()).padStart(2, "0"), month: MONTHS[date.getUTCMonth()] };
}

export function winnerLineOf(
  podium: { playerName: string; points: number; rank: number }[],
): { names: string; points: number } | null {
  const winners = podium.filter((p) => p.rank === 1);
  if (winners.length === 0) return null;
  return { names: winners.map((w) => w.playerName).join(" · "), points: winners[0].points };
}

const HEADING = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatGameDayHeading(date: Date): string {
  return HEADING.format(date);
}
