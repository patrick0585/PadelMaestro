import { CalendarDays } from "lucide-react";
import { MEDAL, TICKET_HEAD, TICKET_PILL } from "./styles";

export interface RecapRow {
  playerId: string;
  name: string;
  rank: number;
  ppg: number;
}

export function RecapTicket({ dateLabel, podium }: { dateLabel: string | null; podium: RecapRow[] }) {
  return (
    <section aria-label={dateLabel ? "Letzter Spieltag" : "Spieltag"} className="ticket">
      <div className={TICKET_HEAD}>
        <span>{dateLabel ? `Letzter Spieltag · ${dateLabel}` : "Spieltag"}</span>
        {dateLabel && (
          <span className={TICKET_PILL}>
            Abpfiff
          </span>
        )}
      </div>
      {podium.length > 0 && (
        <ol className="mt-3 grid grid-cols-3 gap-2">
          {podium.map((r) => (
            <li
              key={r.playerId}
              className={`min-w-0 rounded-[14px] p-2.5 ${r.rank === 1 ? "bg-lime/15 outline outline-1 outline-lime/50" : "bg-black/50"}`}
            >
              <span className="text-[22px] leading-none" role="img" aria-label={`Platz ${r.rank}`}>
                {MEDAL[r.rank] ?? r.rank}
              </span>
              <b className="mt-1.5 block truncate text-[15px] text-white">{r.name}</b>
              <span className={`font-display font-bold tabular-nums ${r.rank === 1 ? "text-[24px] text-lime" : "text-[20px] text-[#cffafe]"}`}>
                {r.ppg.toFixed(2)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[13px] text-[#d9f6fb]">
        <CalendarDays aria-hidden="true" className="size-4" />
        {dateLabel ? "Nächster Spieltag noch nicht geplant" : "Noch kein Spieltag geplant"}
      </p>
    </section>
  );
}
