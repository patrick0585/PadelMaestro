import type { DayTrend, TrendDelta } from "@/lib/player/season-stats";

const TREND: Record<TrendDelta, { cls: string; arrow: string; label: string }> = {
  up: { cls: "bg-success-soft text-success", arrow: "↑", label: "Verbessert" },
  down: { cls: "bg-destructive-soft text-destructive", arrow: "↓", label: "Verschlechtert" },
  flat: { cls: "bg-surface-muted text-foreground-muted", arrow: "→", label: "Unverändert" },
};

function placementTone(placement: number, total: number) {
  if (placement === 1) return "bg-primary-soft text-primary-strong ring-1 ring-primary/40";
  if (placement <= 3 && total >= 4) return "bg-success-soft text-success ring-1 ring-success/30";
  return "bg-surface-muted text-foreground";
}

function formatDate(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function Stat({ value, unit }: { value: number; unit: string }) {
  return (
    <span>
      <span className="tabular-nums">{value}</span>
      <span className="ml-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-foreground-muted">
        {unit}
      </span>
    </span>
  );
}

export function DayPpgStrip({ days }: { days: DayTrend[] }) {
  if (days.length === 0) return null;
  return (
    <ul
      aria-label="Letzte Spieltage"
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
    >
      {days.map((d) => {
        const trend = TREND[d.delta];
        const place = placementTone(d.placement, d.totalPlayers);
        const ppgDisplay = d.ppg.toFixed(1);
        return (
          <li
            key={d.gameDayId}
            aria-label={`Spieltag ${formatDate(d.date)}: Platz ${d.placement} von ${d.totalPlayers}, ${d.points} Punkte, ${d.matches} Spiele, ${ppgDisplay} PPG (${trend.label})`}
            className="flex w-[7.25rem] shrink-0 flex-col rounded-xl border border-border bg-surface p-2.5"
          >
            <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-foreground-muted">
              {formatDate(d.date)}
            </div>
            <div className={`mt-1.5 flex items-baseline gap-1 rounded-lg px-2 py-1 ${place}`}>
              <span className="text-2xl font-extrabold leading-none tabular-nums">
                {d.placement}.
              </span>
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider opacity-80">
                v. {d.totalPlayers}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between text-[0.7rem] font-semibold text-foreground">
              <Stat value={d.points} unit="Pt" />
              <Stat value={d.matches} unit="Sp" />
            </div>
            <div
              className={`mt-1.5 inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums ${trend.cls}`}
            >
              <span aria-hidden="true">{trend.arrow}</span>
              <span>{ppgDisplay} PPG</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
