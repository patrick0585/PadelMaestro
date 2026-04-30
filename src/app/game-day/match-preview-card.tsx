// Read-only match card used during the planned-state preview. Same
// visual rhythm as MatchInlineCard but without state, fetch, or score
// entry — players see the team layout but cannot type anything yet.

export interface MatchPreviewRow {
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
}

export function MatchPreviewCard({ match }: { match: MatchPreviewRow }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/60 p-3 opacity-90">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Match {match.matchNumber} · Vorschau
        </span>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team1A} / {match.team1B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team A</div>
        </div>
        <span
          className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-foreground-muted"
          aria-hidden
        >
          –
        </span>
        <span className="text-xs font-semibold text-foreground-dim">:</span>
        <span
          className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-foreground-muted"
          aria-hidden
        >
          –
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team2A} / {match.team2B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team B</div>
        </div>
      </div>
    </div>
  );
}
