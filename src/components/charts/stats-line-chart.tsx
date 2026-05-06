"use client";

import { useState } from "react";

export interface ChartSeries {
  name: string;
  values: (number | null)[];
  color: string;
  highlighted: boolean;
}

const W = 600;
const H = 260;
const PAD = { top: 12, right: 88, bottom: 28, left: 36 };
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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
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
              fontSize={10}
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
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            className="fill-foreground-muted"
          >
            {label}
          </text>
        ))}

        {/* Y axis label */}
        <text
          x={PAD.left - 28}
          y={PAD.top + INNER_H / 2}
          fontSize={10}
          textAnchor="middle"
          transform={`rotate(-90 ${PAD.left - 28} ${PAD.top + INNER_H / 2})`}
          className="fill-foreground-muted"
        >
          {yLabel}
        </text>

        {/* Lines — render muted ones first, highlighted last so it sits on top */}
        {[...series]
          .sort((a, b) => Number(a.highlighted) - Number(b.highlighted))
          .map((s) => {
            const segments: string[] = [];
            let current: string[] = [];
            s.values.forEach((v, i) => {
              if (v == null) {
                if (current.length > 1) segments.push(current.join(" "));
                current = [];
              } else {
                current.push(`${xPos(i)},${yPos(v)}`);
              }
            });
            if (current.length > 1) segments.push(current.join(" "));

            return (
              <g key={s.name}>
                {segments.map((seg, idx) => (
                  <polyline
                    key={idx}
                    points={seg}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.highlighted ? 2.5 : 1.4}
                    strokeOpacity={s.highlighted ? 1 : 0.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {/* Dots */}
                {s.values.map((v, i) =>
                  v == null ? null : (
                    <circle
                      key={i}
                      cx={xPos(i)}
                      cy={yPos(v)}
                      r={s.highlighted ? 3 : 2}
                      fill={s.color}
                      opacity={s.highlighted ? 1 : 0.75}
                    />
                  ),
                )}
                {/* Endpoint name */}
                {(() => {
                  let lastIdx = -1;
                  for (let i = s.values.length - 1; i >= 0; i--) {
                    if (s.values[i] != null) {
                      lastIdx = i;
                      break;
                    }
                  }
                  if (lastIdx < 0) return null;
                  const v = s.values[lastIdx]!;
                  return (
                    <text
                      x={xPos(lastIdx) + 6}
                      y={yPos(v) + 4}
                      fontSize={11}
                      fontWeight={s.highlighted ? 700 : 500}
                      fill={s.color}
                      opacity={s.highlighted ? 1 : 0.85}
                    >
                      {s.name}
                    </text>
                  );
                })()}
              </g>
            );
          })}

        {/* Hover overlay — highlights the day */}
        {hoveredIdx != null && (
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
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onTouchStart={() => setHoveredIdx(i)}
              onTouchEnd={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {/* Tooltip / readout below the chart */}
      {hoveredIdx != null && (
        <div className="rounded-lg border border-border bg-surface-muted p-2 text-xs">
          <p className="font-semibold text-foreground">Spieltag {xLabels[hoveredIdx]}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {series
              .map((s) => ({ name: s.name, value: s.values[hoveredIdx], color: s.color, highlighted: s.highlighted }))
              .filter((r) => r.value != null)
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .map((r) => (
                <li key={r.name} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-3 rounded-sm"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className={`tabular-nums ${r.highlighted ? "font-bold text-foreground" : "text-foreground-muted"}`}>
                    {r.name}: {r.value}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
