import type { RankingRow } from "@/lib/ranking/compute";

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-foreground-muted">Noch keine Spieler mit Matches.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {ranking.map((r) => (
          <li key={r.playerId} className="flex items-center gap-4 px-4 py-3">
            <span className="w-6 text-right text-base font-extrabold text-primary tabular-nums">
              {r.rank}
            </span>
            <span className="flex-1 text-sm font-semibold text-foreground">{r.playerName}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground-muted">
              {r.pointsPerGame.toFixed(2)}
            </span>
            <span className="min-w-[3rem] rounded-full bg-surface-muted px-2 py-0.5 text-right text-[0.65rem] font-semibold tabular-nums text-foreground-muted">
              {r.games}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
