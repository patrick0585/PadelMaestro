import { Avatar } from "@/components/ui/avatar";
import type { RankingRow } from "@/lib/ranking/compute";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const GRID = "grid grid-cols-[2rem_2.5rem_1fr_3rem_3rem_2.25rem_2.25rem] items-center gap-2";

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-foreground-muted">Noch keine Spieler mit Matches.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`${GRID} border-b border-border bg-surface-muted px-3 py-2 text-[0.6rem] font-semibold uppercase tracking-wider text-foreground-muted`}
      >
        <span className="text-center">Pos</span>
        <span aria-hidden="true" />
        <span>Name</span>
        <span className="text-right">Pt</span>
        <span className="text-right">Ø</span>
        <span className="text-right">Sp</span>
        <span className="text-right">Jkr</span>
      </div>
      <ul className="divide-y divide-border">
        {ranking.map((r) => {
          const totalMedals = r.medals.gold + r.medals.silver + r.medals.bronze;
          return (
            <li key={r.playerId} className={`${GRID} px-3 py-3`}>
              <span className="text-center tabular-nums">
                {MEDALS[r.rank] ? (
                  <span aria-label={`Platz ${r.rank}`} className="text-lg" role="img">
                    {MEDALS[r.rank]}
                  </span>
                ) : (
                  <span className="text-sm font-extrabold text-primary">{r.rank}</span>
                )}
              </span>
              <Avatar
                playerId={r.playerId}
                name={r.playerName}
                avatarVersion={r.avatarVersion}
                size={32}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {r.playerName}
                </div>
                {totalMedals > 0 && (
                  <div
                    className="mt-0.5 text-[0.65rem] tabular-nums text-foreground-muted"
                    aria-label={`${r.medals.gold} Gold, ${r.medals.silver} Silber, ${r.medals.bronze} Bronze`}
                  >
                    {r.medals.gold > 0 && <span className="mr-1.5">🥇{r.medals.gold}</span>}
                    {r.medals.silver > 0 && <span className="mr-1.5">🥈{r.medals.silver}</span>}
                    {r.medals.bronze > 0 && <span>🥉{r.medals.bronze}</span>}
                  </div>
                )}
              </div>
              <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                {r.points.toFixed(0)}
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-foreground-muted">
                {r.pointsPerGame.toFixed(2)}
              </span>
              <span className="text-right text-xs tabular-nums text-foreground-muted">
                {r.games}
              </span>
              <span className="text-right text-xs tabular-nums text-foreground-muted">
                {r.jokersUsed}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
