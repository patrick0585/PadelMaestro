export function formatScoredBy(
  scoredByName: string | null | undefined,
  scoredAtIso: string | null | undefined,
): string | null {
  if (!scoredByName || !scoredAtIso) return null;
  const time = new Date(scoredAtIso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `eingetragen von ${scoredByName} · ${time}`;
}
