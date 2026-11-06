import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FormBars } from "./form-bars";
import { FOCUS_INSET } from "@/components/ui/focus";

export interface LeagueRow {
  playerId: string;
  name: string;
  avatarVersion: number;
  rank: number;
  points: number;
  ppg: number;
  form: (number | null)[];
  isMe: boolean;
}

export function LeagueTable({ rows, myGap = null }: { rows: LeagueRow[]; myGap?: string | null }) {
  return (
    <section aria-labelledby="home-table" className="overflow-hidden rounded-[18px] border border-border bg-surface">
      <h2 id="home-table" className="px-3.5 pt-3 font-display text-[15px] font-bold uppercase tracking-[0.16em]">
        Tabelle
      </h2>
      <ol>
        {rows.map((r, i) => {
          const gap = i > 0 && r.rank > rows[i - 1].rank + 1;
          return (
            <li
              key={r.playerId}
              aria-current={r.isMe ? "true" : undefined}
              className={`grid grid-cols-[28px_32px_1fr_auto_auto] items-center gap-2.5 border-border px-3.5 py-2.5 ${i > 0 ? "border-t" : ""} ${gap ? "border-t-2 border-dashed" : ""} ${r.isMe ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.16),transparent)] shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
            >
              <span className={`text-center font-display text-[24px] font-extrabold tabular-nums ${r.isMe ? "text-lime" : "text-foreground-muted"}`}>
                {r.rank}
              </span>
              <Avatar playerId={r.playerId} name={r.name} avatarVersion={r.avatarVersion} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="block text-xs text-foreground-muted">
                  {r.isMe ? "Du · " : ""}
                  {r.ppg.toFixed(2)} PPG
                </span>
                {r.isMe && myGap && <span className="block text-[11.5px] font-semibold text-primary">{myGap}</span>}
              </span>
              <FormBars values={r.form} me={r.isMe} />
              <span className="min-w-[3ch] text-right font-display text-[24px] font-extrabold tabular-nums">
                {r.points.toFixed(0)}
                <span className="sr-only"> Punkte</span>
              </span>
            </li>
          );
        })}
      </ol>
      <Link
        href="/ranking"
        className={`flex min-h-11 items-center justify-between border-t border-border px-3.5 text-sm font-semibold text-primary ${FOCUS_INSET}`}
      >
        Ganze Rangliste <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
