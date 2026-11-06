"use client";

import { useState } from "react";
import { StatsLineChart, TONE_COLOR, type ChartSeries, type SeriesTone } from "@/components/charts/stats-line-chart";

export interface SeasonTrendChartData {
  days: { date: string }[]; // ISO date strings (server-passed)
  players: {
    playerId: string;
    name: string;
    values: (number | null)[];
    points: (number | null)[];
    jokerDays: boolean[];
  }[];
  totalPlayers: number; // distinct active players in the season — Y-axis bound
}

type Mode = "rank" | "points";

function pointsAxis(max: number): { yMax: number; step: number } {
  const step = max <= 40 ? 10 : max <= 100 ? 25 : 50;
  return { yMax: Math.max(step, Math.ceil(max / step) * step), step };
}

const firstName = (name: string) => name.split(" ")[0];

const toneStyle = (t: SeriesTone) => ({ borderColor: TONE_COLOR[t], color: TONE_COLOR[t] });

const TOGGLE =
  "min-h-10 rounded-[7px] px-3 font-display text-[13px] font-bold uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function SeasonTrendChart({
  data,
  currentPlayerId,
  leaderId,
}: {
  data: SeasonTrendChartData;
  currentPlayerId: string;
  leaderId: string | null;
}) {
  const [mode, setMode] = useState<Mode>("rank");
  const [pickId, setPickId] = useState<string | null>(null);

  const xLabels = data.days.map((d) =>
    new Date(d.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
  );
  const tone = (id: string): SeriesTone =>
    id === currentPlayerId ? "me" : id === leaderId ? "lead" : id === pickId ? "pick" : "rest";

  const series: ChartSeries[] = data.players.map((p) => ({
    id: p.playerId,
    name: firstName(p.name),
    values: mode === "rank" ? p.values : p.points.map((v) => (v == null ? null : Math.round(v))),
    tone: tone(p.playerId),
    dashed: p.jokerDays,
  }));
  const maxPoints = Math.max(0, ...data.players.flatMap((p) => p.points.map((v) => Math.round(v ?? 0))));
  const axis = pointsAxis(maxPoints);

  const leader = data.players.find((p) => p.playerId === leaderId && p.playerId !== currentPlayerId);
  const others = data.players
    .filter((p) => p.playerId !== currentPlayerId && p.playerId !== leaderId)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const hasJoker = data.players.some((p) => p.jokerDays.some(Boolean));

  return (
    <section aria-labelledby="season-trend" className="rounded-[18px] border border-border bg-surface px-3.5 py-3">
      <h2 id="season-trend" className="sr-only">
        Saisonverlauf
      </h2>
      <div className="mb-2 flex justify-end">
        <div role="group" aria-label="Darstellung" className="inline-flex rounded-[9px] border border-border bg-background p-0.5">
          {(["rank", "points"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`${TOGGLE} ${mode === m ? "bg-surface-elevated text-primary" : "text-foreground-muted"}`}
            >
              {m === "rank" ? "Platz" : "Punkte"}
            </button>
          ))}
        </div>
      </div>

      {mode === "rank" ? (
        <StatsLineChart
          series={series}
          xLabels={xLabels}
          yMin={1}
          yMax={Math.max(data.totalPlayers, 1)}
          yLabel="Platz"
          invertY
          yTickStep={1}
          yTickStyle="rank"
        />
      ) : (
        <StatsLineChart series={series} xLabels={xLabels} yMax={axis.yMax} yTickStep={axis.step} yLabel="Punkte" />
      )}

      <ul className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Legende">
        <li className="rounded-full border px-2.5 py-1 font-semibold" style={toneStyle("me")}>
          Du
        </li>
        {leader && (
          <li className="rounded-full border px-2.5 py-1 font-semibold" style={toneStyle("lead")}>
            {firstName(leader.name)} · Platz 1
          </li>
        )}
      </ul>
      {hasJoker && <p className="mt-2 text-[11.5px] text-foreground-muted">Gestrichelt: Joker-Tag, Punkte gutgeschrieben.</p>}

      {others.length > 0 && (
        <>
          <p id="trend-compare" className="mt-3 text-[11.5px] text-foreground-muted">
            Vergleichen mit:
          </p>
          <div role="group" aria-labelledby="trend-compare" className="mt-1.5 flex flex-wrap gap-2">
            {others.map((p) => {
              const on = p.playerId === pickId;
              return (
                <button
                  key={p.playerId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPickId(on ? null : p.playerId)}
                  className={`min-h-11 rounded-full border border-border px-3.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "bg-[#c4b5fd]/15 font-semibold" : "text-foreground-muted"}`}
                  style={on ? toneStyle("pick") : undefined}
                >
                  {firstName(p.name)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
