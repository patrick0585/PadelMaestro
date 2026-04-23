import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDe } from "@/lib/format";
import type { JokerUseRow } from "@/lib/joker/list";

export function JokerBlock({ jokers }: { jokers: JokerUseRow[] }) {
  if (jokers.length === 0) return null;

  return (
    <section
      aria-label="Joker an diesem Tag"
      className="space-y-2 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        Joker an diesem Tag
      </div>
      <ul className="space-y-2">
        {jokers.map((j) => (
          <li key={j.playerId} className="flex items-center gap-3">
            <Avatar
              playerId={j.playerId}
              name={j.playerName}
              avatarVersion={j.avatarVersion}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {j.playerName}
                </span>
                <Badge variant="warning">Joker</Badge>
              </div>
              <div className="text-[0.7rem] text-foreground-muted tabular-nums">
                {j.gamesCredited} × {formatDe(j.ppgAtUse, 2)} ≈{" "}
                {Math.round(j.pointsCredited)} P.
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
