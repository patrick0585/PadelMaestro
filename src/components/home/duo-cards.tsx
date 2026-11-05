import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { PartnerStat } from "@/lib/player/season-stats";
import { LABEL } from "./styles";

const TONE = {
  best: {
    row: "bg-[linear-gradient(90deg,rgba(190,242,100,0.12),transparent_70%)] shadow-[inset_3px_0_0_var(--success)]",
    kicker: "text-lime-200",
    num: "text-lime",
  },
  worst: {
    row: "bg-[linear-gradient(90deg,rgba(251,113,133,0.10),transparent_70%)] shadow-[inset_3px_0_0_#fb7185]",
    kicker: "text-rose-200",
    num: "text-rose-300",
  },
};

function DuoRow({ kind, label, p }: { kind: keyof typeof TONE; label: string; p: PartnerStat }) {
  const t = TONE[kind];
  return (
    <li className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 px-3.5 py-3 ${t.row}`}>
      <Avatar playerId={p.playerId} name={p.name} avatarVersion={p.avatarVersion} size={32} />
      <div className="min-w-0">
        <p className={`font-display text-[11px] font-bold uppercase tracking-[0.14em] ${t.kicker}`}>{label}</p>
        <p className="truncate text-[15px] font-semibold">{p.name}</p>
      </div>
      <div className="text-right">
        <p className={`font-display text-[30px] font-extrabold leading-none tabular-nums ${t.num}`}>
          {(p.pointsTogether / p.matches).toFixed(1)}
          <span className="sr-only"> Punkte pro Match</span>
        </p>
        <p className="mt-0.5 text-[11.5px] text-foreground-muted">
          {p.matches} {p.matches === 1 ? "Match" : "Matches"} · {p.pointsTogether} Pkt
        </p>
      </div>
    </li>
  );
}

export function DuoCards({ best, worst }: { best: PartnerStat; worst: PartnerStat | null }) {
  return (
    <section aria-label="Deine Duos" className="overflow-hidden rounded-[18px] border border-border bg-surface">
      <div className={`flex justify-between border-b border-border px-3.5 py-2.5 ${LABEL}`}>
        <span>Deine Duos</span>
        <span aria-hidden="true">Punkte pro Match</span>
      </div>
      <ul className="divide-y divide-border">
        <DuoRow kind="best" label="Bestes Duo" p={best} />
        {worst ? (
          <DuoRow kind="worst" label="Weniger Glück" p={worst} />
        ) : (
          <li className="px-3.5 py-3 text-xs text-foreground-muted">Noch zu wenig Partner-Daten für einen Vergleich.</li>
        )}
      </ul>
      <Link
        href="/duos"
        className="flex min-h-11 items-center justify-between border-t border-border px-3.5 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        Alle Duos <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
