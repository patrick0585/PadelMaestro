import type { MatchOutcome } from "@/lib/player/season-stats";

const STYLES: Record<MatchOutcome, { cls: string; label: string }> = {
  W: { cls: "bg-success-soft text-success", label: "Gewonnen" },
  L: { cls: "bg-destructive-soft text-destructive", label: "Verloren" },
  D: { cls: "bg-surface-muted text-foreground-muted", label: "Unentschieden" },
};

export function MatchFormStrip({ outcomes }: { outcomes: MatchOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <ul className="flex items-center gap-1.5" role="list">
      {outcomes.map((o, i) => {
        const style = STYLES[o];
        return (
          <li
            key={i}
            aria-label={style.label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${style.cls}`}
          >
            {o}
          </li>
        );
      })}
    </ul>
  );
}
