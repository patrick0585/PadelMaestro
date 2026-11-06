import { LABEL } from "@/components/home/styles";
import type { DayGap } from "@/lib/ranking/trend-view";

const W = 340;
const H = 104;
const PAD_X = 4;
const BASE = H - 18;
const MAX_BARS = 12;
const BAR_COLOR = "rgba(34,211,238,0.35)";

function summaryOf(d: DayGap): string {
  if (d.first) return "Du bist vorne";
  return d.gap === 0 ? "punktgleich" : `jetzt −${d.gap}`;
}

/** Bars per finished day: how far I was behind place 1 (lime = I was on place 1). */
export function GapToLeader({ gaps }: { gaps: (DayGap | null)[] }) {
  const current = gaps.at(-1);
  if (current == null) return null;
  const offset = Math.max(0, gaps.length - MAX_BARS);
  const shown = gaps.slice(offset);
  const max = Math.max(1, ...shown.map((d) => d?.gap ?? 0));
  const slot = (W - PAD_X * 2) / shown.length;
  const bar = Math.min(28, slot - 6);
  const summary = summaryOf(current);

  return (
    <section aria-labelledby="gap-to-leader" className="rounded-[18px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 id="gap-to-leader" className={LABEL}>
          Abstand zur Spitze
        </h2>
        <span className={`${LABEL} ${current.first ? "text-lime" : "text-primary"}`}>{summary}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Abstand zu Platz 1 pro Spieltag, ${summary}`}>
        {shown.map((d, i) => {
          if (d == null) return null;
          const h = d.gap === 0 ? 4 : (d.gap / max) * (BASE - 20);
          const x = PAD_X + i * slot + (slot - bar) / 2;
          const last = i === shown.length - 1;
          return (
            <g key={offset + i}>
              <rect
                x={x}
                y={BASE - h}
                width={bar}
                height={h}
                rx={3}
                fill={d.first ? "var(--success)" : last ? "var(--primary)" : BAR_COLOR}
              />
              <text x={x + bar / 2} y={BASE - h - 4} fontSize={11} textAnchor="middle" className="fill-foreground-muted">
                {d.first ? "1." : d.gap === 0 ? "±0" : `−${d.gap}`}
              </text>
              <text x={x + bar / 2} y={H - 3} fontSize={11} textAnchor="middle" className="fill-foreground-muted">
                {offset + i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11.5px] text-foreground-muted">
        {offset > 0 && `Letzte ${MAX_BARS} Spieltage. `}Deine Punkte hinter Platz 1 nach jedem Spieltag. Grün: Du warst vorne.
      </p>
    </section>
  );
}
