export type StatTileTone = "primary" | "lime";

export interface StatTileProps {
  label: string;
  value: string | null;
  hint?: string;
  tone?: StatTileTone;
}

const TONE_CLASS: Record<StatTileTone, string> = {
  primary: "text-primary",
  lime: "text-success",
};

export function StatTile({ label, value, hint, tone = "primary" }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className={`text-2xl font-extrabold tabular-nums ${TONE_CLASS[tone]}`}>
        {value ?? "–"}
      </div>
      <div className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {label}
      </div>
      {hint && <div className="mt-0.5 text-xs text-foreground-dim">{hint}</div>}
    </div>
  );
}
