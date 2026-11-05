import { Avatar } from "@/components/ui/avatar";
import type { PartnerStat } from "@/lib/player/season-stats";

import { LABEL } from "./styles";

function Duo({ label, p }: { label: string; p: PartnerStat }) {
  const first = p.name.split(" ")[0];
  return (
    <div className="min-w-0 rounded-[18px] border border-border bg-surface p-3.5">
      <span className={`block ${LABEL}`}>{label}</span>
      <div className="mt-2 flex items-center gap-2.5">
        <Avatar playerId={p.playerId} name={p.name} avatarVersion={p.avatarVersion} size={32} />
        <div className="min-w-0">
          <b className="block truncate text-sm">{first}</b>
          <span className="text-xs text-foreground-muted">
            {p.matches} {p.matches === 1 ? "Match" : "Matches"}
          </span>
        </div>
        <strong className="ml-auto font-display text-[26px] font-extrabold tabular-nums">
          {p.pointsTogether}
          <span className="sr-only"> Punkte zusammen</span>
        </strong>
      </div>
    </div>
  );
}

export function DuoCards({ best, worst }: { best: PartnerStat; worst: PartnerStat | null }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Duo label="Bestes Duo" p={best} />
      {worst ? (
        <Duo label="Weniger Glück" p={worst} />
      ) : (
        <div className="rounded-[18px] border border-dashed border-border p-3.5 text-xs text-foreground-muted">
          Noch zu wenig Partner-Daten für einen Vergleich.
        </div>
      )}
    </div>
  );
}
