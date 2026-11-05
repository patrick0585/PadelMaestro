import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";

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

function FormBars({ values, me }: { values: (number | null)[]; me: boolean }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return <span />;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return (
    <span className="flex h-[22px] items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <i
          key={i}
          className={`w-1.5 rounded-sm ${v === null ? "bg-slate-700/40" : me ? "bg-primary" : "bg-slate-600"}`}
          style={{ height: v === null ? 3 : max === min ? 14 : 8 + ((v - min) / (max - min)) * 14 }}
        />
      ))}
    </span>
  );
}

export function LeagueTable({ rows }: { rows: LeagueRow[] }) {
  return (
    <section aria-labelledby="home-table">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="home-table" className="font-display text-[15px] font-bold uppercase tracking-[0.16em]">
          Tabelle
        </h2>
        <Link href="/ranking" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-primary">
          Rangliste
        </Link>
      </div>
      <ol className="overflow-hidden rounded-[18px] border border-border bg-surface">
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
              </span>
              <FormBars values={r.form} me={r.isMe} />
              <span className="min-w-[3ch] text-right font-display text-[24px] font-extrabold tabular-nums">
                {r.points}
                <span className="sr-only"> Punkte</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
