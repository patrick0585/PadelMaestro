"use client";

import { useState } from "react";

export type SeriesTone = "me" | "lead" | "pick" | "rest";

export interface ChartSeries {
  id: string;
  name: string;
  values: (number | null)[];
  tone: SeriesTone;
  // Per point: the segment leading INTO this point is drawn dashed (joker day).
  dashed?: boolean[];
}

export const TONE_COLOR: Record<SeriesTone, string> = {
  me: "#22d3ee",
  lead: "#fbbf24",
  pick: "#c4b5fd",
  rest: "#64748b",
};
const TONE_ORDER: Record<SeriesTone, number> = { rest: 0, pick: 1, lead: 2, me: 3 };

// Roughly phone width, so SVG font sizes match on-screen pixels.
const W = 360;
const H = 210;
const PAD = { top: 12, right: 62, bottom: 24, left: 30 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

// `yTickStyle` is a serializable enum rather than a function so the chart
// can be rendered inside a Server Component without breaking the
// RSC client-boundary serialization rule.
type YTickStyle = "decimal" | "rank";
function formatTick(v: number, style: YTickStyle): string {
  if (style === "rank") return `${Math.round(v)}.`;
  return String(Math.round(v * 10) / 10);
}

export function StatsLineChart({
  series,
  xLabels,
  yMin = 0,
  yMax,
  yLabel,
  invertY = false,
  yTickStyle = "decimal",
  yTickStep,
}: {
  series: ChartSeries[];
  xLabels: string[];
  yMin?: number;
  yMax: number;
  yLabel: string;
  invertY?: boolean;
  yTickStyle?: YTickStyle;
  yTickStep?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const hoveredIdx = picked ?? xLabels.length - 1;
  const xStep = INNER_W / Math.max(1, xLabels.length - 1);
  const xPos = (i: number) => PAD.left + i * xStep;
  const yPos = (v: number) => {
    const t = (v - yMin) / Math.max(1e-9, yMax - yMin);
    return invertY ? PAD.top + t * INNER_H : PAD.top + INNER_H - t * INNER_H;
  };

  const tickStep = yTickStep ?? (yMax - yMin) / 4;
  const tickCount = Math.round((yMax - yMin) / tickStep);
  const yTickValues = Array.from({ length: tickCount + 1 }, (_, i) => yMin + i * tickStep);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`Liniendiagramm ${yLabel} pro Spieltag`}
      >
        {/* Y gridlines + labels */}
        {yTickValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yPos(v)}
              y2={yPos(v)}
              stroke="currentColor"
              strokeOpacity={0.08}
              className="text-foreground"
            />
            <text
              x={PAD.left - 6}
              y={yPos(v) + 4}
              textAnchor="end"
              fontSize={11}
              className="fill-foreground-muted"
            >
              {formatTick(v, yTickStyle)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={xPos(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={11}
            className="fill-foreground-muted"
          >
            {label}
          </text>
        ))}

        {/* Grey lines first, emphasised ones on top */}
        {[...series]
          .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
          .map((s) => {
            const color = TONE_COLOR[s.tone];
            const strong = s.tone !== "rest";
            let lastIdx = -1;
            s.values.forEach((v, i) => {
              if (v != null) lastIdx = i;
            });
            return (
              <g key={s.id}>
                {s.values.map((v, i) => {
                  const prev = i > 0 ? s.values[i - 1] : null;
                  if (v == null || prev == null) return null;
                  return (
                    <line
                      key={i}
                      x1={xPos(i - 1)}
                      y1={yPos(prev)}
                      x2={xPos(i)}
                      y2={yPos(v)}
                      stroke={color}
                      strokeWidth={strong ? 2.5 : 1.6}
                      strokeLinecap="round"
                      strokeDasharray={s.dashed?.[i] ? "6 5" : undefined}
                    />
                  );
                })}
                {strong &&
                  s.values.map((v, i) =>
                    v == null ? null : s.dashed?.[i] ? (
                      <circle key={i} cx={xPos(i)} cy={yPos(v)} r={4} fill="var(--surface)" stroke={color} strokeWidth={2} />
                    ) : (
                      <circle key={i} cx={xPos(i)} cy={yPos(v)} r={i === lastIdx ? 4 : 2.5} fill={color} />
                    ),
                  )}
                {strong && lastIdx >= 0 && (
                  <text x={xPos(lastIdx) + 7} y={yPos(s.values[lastIdx]!) + 4} fontSize={12.5} fontWeight={700} fill={color}>
                    {s.name}
                  </text>
                )}
              </g>
            );
          })}

        {/* Selected day */}
        {xLabels.length > 0 && (
          <line
            x1={xPos(hoveredIdx)}
            x2={xPos(hoveredIdx)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="currentColor"
            strokeOpacity={0.2}
            className="text-foreground"
          />
        )}

        {/* Invisible hit areas for hover/tap per game day. The leftmost
            and rightmost cells clamp to the chart edges so the first and
            last data points have full-width tap zones (the naïve
            xPos(i) ± xStep/2 would clip the first cell to half width). */}
        {xLabels.map((_, i) => {
          const center = xPos(i);
          const left = i === 0 ? PAD.left : center - xStep / 2;
          const right = i === xLabels.length - 1 ? W - PAD.right : center + xStep / 2;
          return (
            <rect
              key={i}
              x={left}
              y={PAD.top}
              width={right - left}
              height={INNER_H}
              fill="transparent"
              onPointerEnter={() => setPicked(i)}
              onPointerDown={() => setPicked(i)}
            />
          );
        })}
      </svg>

      {/* Readout for the selected day (defaults to the latest); always rendered so the layout doesn't jump */}
      {xLabels.length > 0 && (
        <div aria-live="polite" className="mt-2 rounded-lg border border-border bg-surface-muted p-2 text-xs">
          <p className="font-semibold text-foreground">Spieltag {xLabels[hoveredIdx]}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {series
              .map((s) => ({ id: s.id, name: s.name, value: s.values[hoveredIdx], tone: s.tone }))
              .filter((r) => r.value != null)
              .sort((a, b) => (invertY ? a.value! - b.value! : b.value! - a.value!))
              .map((r) => (
                <li key={r.id} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-3 rounded-sm"
                    style={{ backgroundColor: TONE_COLOR[r.tone] }}
                  />
                  <span className={`tabular-nums ${r.tone !== "rest" ? "font-bold text-foreground" : "text-foreground-muted"}`}>
                    {r.name}: {formatTick(r.value!, yTickStyle)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
