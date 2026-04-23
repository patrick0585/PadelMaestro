import type { DayTrend, TrendDelta } from "@/lib/player/season-stats";

const STYLES: Record<TrendDelta, { cls: string; label: string }> = {
  up: { cls: "bg-success-soft text-success", label: "Verbessert" },
  down: { cls: "bg-destructive-soft text-destructive", label: "Verschlechtert" },
  flat: { cls: "bg-surface-muted text-foreground-muted", label: "Unverändert" },
};

export function DayPpgStrip({ days }: { days: DayTrend[] }) {
  if (days.length === 0) return null;
  return (
    <ul className="flex items-center gap-1.5" role="list">
      {days.map((d) => {
        const style = STYLES[d.delta];
        return (
          <li
            key={d.gameDayId}
            aria-label={`${style.label} (${d.ppg.toFixed(1)} PPG)`}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-extrabold tabular-nums ${style.cls}`}
          >
            {d.ppg.toFixed(1)}
          </li>
        );
      })}
    </ul>
  );
}
