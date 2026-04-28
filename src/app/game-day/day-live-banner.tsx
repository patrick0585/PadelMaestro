import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { DayLiveStandingsRow } from "@/lib/game-day/live-standings";

const PODIUM_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export interface DayLiveBannerProps {
  rows: DayLiveStandingsRow[];
  scoredMatchCount: number;
  totalMatchCount: number;
  hasPreviousState: boolean;
}

export function DayLiveBanner({
  rows,
  scoredMatchCount,
  totalMatchCount,
  hasPreviousState,
}: DayLiveBannerProps) {
  if (scoredMatchCount === 0) return null;

  return (
    <section
      aria-label="Live-Tagesranking"
      className="overflow-hidden rounded-2xl border border-primary/40 bg-[image:var(--hero-gradient)] p-4"
    >
      <div className="flex items-center justify-between">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-primary-strong">
          Live-Tagesranking
        </div>
        <div className="text-[0.65rem] font-semibold tabular-nums text-foreground-muted">
          {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </div>
      </div>

      <ol className="mt-3 space-y-1.5">
        {rows.map((row) => {
          const medal = PODIUM_MEDALS[row.rank];
          return (
            <li
              key={row.playerId}
              className="grid grid-cols-[1.5rem_2.25rem_1fr_1rem_2.5rem] items-center gap-2 rounded-xl bg-surface/70 px-2.5 py-1.5 backdrop-blur"
            >
              <span className="text-center tabular-nums">
                {medal ? (
                  <span
                    className="text-lg"
                    role="img"
                    aria-label={`Platz ${row.rank}`}
                  >
                    {medal}
                  </span>
                ) : (
                  <span className="text-sm font-bold text-foreground-muted">
                    {row.rank}
                  </span>
                )}
              </span>
              <Avatar
                playerId={row.playerId}
                name={row.playerName}
                avatarVersion={row.avatarVersion}
                size={32}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {row.playerName}
                </div>
                <div className="text-[0.6rem] text-foreground-muted tabular-nums">
                  {row.matches} {row.matches === 1 ? "Match" : "Matches"}
                </div>
              </div>
              <RankDelta
                rank={row.rank}
                previousRank={row.previousRank}
                hasPreviousState={hasPreviousState}
              />
              <div className="text-right text-base font-extrabold tabular-nums text-primary">
                {row.points}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RankDelta({
  rank,
  previousRank,
  hasPreviousState,
}: {
  rank: number;
  previousRank: number | null;
  hasPreviousState: boolean;
}) {
  if (!hasPreviousState) return <span aria-hidden="true" />;
  if (previousRank === null) return <span aria-hidden="true" />;
  const delta = previousRank - rank;
  if (delta > 0) {
    return (
      <ArrowUp
        className="h-4 w-4 text-foreground-muted"
        role="img"
        aria-label={delta === 1 ? "1 Platz nach oben" : `${delta} Plätze nach oben`}
      />
    );
  }
  if (delta < 0) {
    const down = Math.abs(delta);
    return (
      <ArrowDown
        className="h-4 w-4 text-foreground-muted"
        role="img"
        aria-label={down === 1 ? "1 Platz nach unten" : `${down} Plätze nach unten`}
      />
    );
  }
  return <span aria-hidden="true" />;
}
