import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LiveTicket as LiveTicketData } from "@/lib/home/live-ticket";
import { TICKET_HEAD } from "./styles";

const SEG: Record<string, string> = {
  done: "bg-lime",
  current: "bg-white anim-pulse",
  open: "bg-white/20",
};

function Team({ names, align }: { names: [string, string]; align: "left" | "right" }) {
  return (
    <div className={`min-w-0 text-[13px] leading-tight text-[#c7e9ef] ${align === "right" ? "text-right" : ""}`}>
      <b className="block truncate text-[15px] text-white">{names[0]}</b>
      <span className="block truncate">{names[1]}</span>
    </div>
  );
}

function Score({ score: [a, b] }: { score: [number, number] }) {
  return (
    <p role="img" aria-label={`${a} zu ${b}`} className="font-display text-[56px] font-extrabold leading-none tabular-nums">
      <span aria-hidden="true" className={a >= b ? "text-lime" : "text-white"}>{a}</span>
      <span aria-hidden="true" className="mx-1 text-[#7dd3e0]">:</span>
      <span aria-hidden="true" className={b >= a ? "text-lime" : "text-white"}>{b}</span>
    </p>
  );
}

export function LiveTicket({ data }: { data: LiveTicketData }) {
  const progress =
    data.total === 0
      ? "Noch keine Matches"
      : data.currentNumber !== null
        ? `Match ${data.currentNumber} von ${data.total}`
        : `Alle ${data.total} Matches gewertet`;
  return (
    <section aria-label="Spieltag läuft" className="ticket">
      <div className={TICKET_HEAD}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[11.5px] tracking-[0.12em] text-white">
          <i aria-hidden="true" className="anim-pulse size-[7px] rounded-full bg-white" />
          Live
        </span>
        <span>{progress}</span>
      </div>
      {data.total > 0 && (
      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, data.total)}, minmax(0, 1fr))` }} aria-hidden="true">
        {data.segments.map((s, i) => (
          <i key={i} className={`h-1.5 rounded-sm ${SEG[s]}`} />
        ))}
      </div>
      )}

      {data.last ? (
        <div className="mt-2.5 rounded-2xl bg-black/55 px-3.5 py-3">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#7dd3e0]">
            Zuletzt · Match {data.last.matchNumber}
          </p>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <Team names={data.last.team1} align="left" />
            <Score score={data.last.score} />
            <Team names={data.last.team2} align="right" />
          </div>
        </div>
      ) : (
        data.current && (
          <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 rounded-2xl bg-black/55 px-3.5 py-3">
            <Team names={data.current.team1} align="left" />
            <p className="font-display text-[28px] font-extrabold uppercase text-[#7dd3e0]">gegen</p>
            <Team names={data.current.team2} align="right" />
          </div>
        )
      )}
      {data.last && data.current && (
        <p className="mt-2.5 truncate text-[13px] text-[#d9f6fb]">
          <b className="text-white">Jetzt:</b> {data.current.team1.join(" & ")} gegen {data.current.team2.join(" & ")}
        </p>
      )}
      <Link
        href="/game-day"
        className="mt-3 flex min-h-[46px] items-center justify-between rounded-xl bg-lime px-4 text-[15px] font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Zum Spieltag <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </section>
  );
}
