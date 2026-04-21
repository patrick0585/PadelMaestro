import type { RankingRow } from "@/lib/ranking/compute";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return (
      <Card>
        <p className="p-8 text-center text-sm text-muted-foreground">
          Noch keine gewerteten Spiele in dieser Saison.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {ranking.map((r) => {
        const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : null;
        const highlight = r.rank <= 3;
        return (
          <li
            key={r.playerId}
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
              highlight
                ? "bg-primary-soft border-primary-border"
                : "bg-surface border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              {medal ? (
                <span className="text-2xl" aria-label={`Platz ${r.rank}`}>
                  {medal}
                </span>
              ) : (
                <Badge variant="neutral" aria-label={`Platz ${r.rank}`}>
                  {r.rank}
                </Badge>
              )}
              <span className="font-medium text-foreground">{r.playerName}</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-foreground">
                {r.pointsPerGame.toFixed(2)} ppS
              </div>
              <div className="text-xs text-muted-foreground">
                {r.games} Spiele · {r.points.toFixed(0)} Pkt · {r.jokersUsed} Joker
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
