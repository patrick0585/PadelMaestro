import { determineWinner } from "@/lib/game-day/match-display";
import { formatScoredBy } from "@/lib/match/scored-by";

export interface ReadOnlyMatch {
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
  team1Score: number | null;
  team2Score: number | null;
  scoredByName: string | null;
  scoredAt: string | null;
}

export function ReadOnlyMatchCard({ match }: { match: ReadOnlyMatch }) {
  const hasScore = match.team1Score !== null && match.team2Score !== null;
  const winner = determineWinner(match.team1Score, match.team2Score);
  const scoredByHint = formatScoredBy(match.scoredByName, match.scoredAt);

  return (
    <article
      aria-label={`Match ${match.matchNumber}`}
      className="rounded-xl border border-border bg-surface-muted p-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Match {match.matchNumber}
          {hasScore ? " · beendet" : " · offen"}
        </span>
        {winner && (
          <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[0.6rem] font-bold text-success">
            {winner === "team1" ? "Team A gewinnt" : "Team B gewinnt"}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team1A} / {match.team1B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team A</div>
        </div>
        <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
          {match.team1Score ?? "–"}
        </span>
        <span className="text-xs font-semibold text-foreground-dim">:</span>
        <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
          {match.team2Score ?? "–"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team2A} / {match.team2B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team B</div>
        </div>
      </div>

      {scoredByHint && (
        <div className="mt-2 truncate text-[0.65rem] text-foreground-muted">{scoredByHint}</div>
      )}
    </article>
  );
}
