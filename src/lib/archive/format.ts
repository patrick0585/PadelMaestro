export function winnerLineOf(
  podium: { playerName: string; points: number; rank: number }[],
): { names: string; points: number } | null {
  const winners = podium.filter((p) => p.rank === 1);
  if (winners.length === 0) return null;
  return { names: winners.map((w) => w.playerName).join(" · "), points: winners[0].points };
}
