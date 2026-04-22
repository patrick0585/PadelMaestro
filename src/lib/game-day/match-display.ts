export type MatchWinner = "team1" | "team2" | null;

export function determineWinner(
  team1Score: number | null,
  team2Score: number | null,
): MatchWinner {
  if (team1Score === null || team2Score === null) return null;
  if (team1Score > team2Score) return "team1";
  if (team2Score > team1Score) return "team2";
  return null;
}
