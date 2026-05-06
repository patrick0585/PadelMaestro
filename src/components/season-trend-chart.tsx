"use client";

import { StatsLineChart, type ChartSeries } from "@/components/charts/stats-line-chart";

const HIGHLIGHT_COLOR = "#22d3ee"; // primary cyan — reserved for the logged-in player
const PALETTE = [
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fb923c", // orange
  "#34d399", // emerald
  "#fbbf24", // amber
  "#60a5fa", // sky-blue
  "#f87171", // red
  "#a3e635", // lime
];

// Stable hash so the same player keeps the same color across renders,
// across sessions, and as the roster grows. djb2-ish; the absolute
// value of the result is irrelevant — only the modulo into PALETTE
// matters, and we want it cheap and synchronous.
function colorForPlayer(playerId: string): string {
  let hash = 5381;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 33 + playerId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export interface SeasonTrendChartData {
  days: { date: string }[]; // ISO date strings (server-passed)
  players: { playerId: string; name: string; values: (number | null)[] }[];
  totalPlayers: number; // distinct active players in the season — Y-axis bound
}

export function SeasonTrendChart({
  data,
  currentPlayerId,
}: {
  data: SeasonTrendChartData;
  currentPlayerId: string;
}) {
  if (data.days.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">
        Noch keine abgeschlossenen Spieltage in dieser Saison.
      </p>
    );
  }

  const xLabels = data.days.map((d) =>
    new Date(d.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
  );
  // Y-axis spans 1..totalPlayers so the cumulative-rank scale stays
  // consistent across the season (a player at rank 5 on day 2 sits at
  // the same screen position as rank 5 on day 12).
  const yMax = Math.max(data.totalPlayers, 1);

  const series: ChartSeries[] = data.players.map((p) => {
    const isMe = p.playerId === currentPlayerId;
    return {
      name: p.name,
      values: p.values,
      color: isMe ? HIGHLIGHT_COLOR : colorForPlayer(p.playerId),
      highlighted: isMe,
    };
  });

  return (
    <StatsLineChart
      series={series}
      xLabels={xLabels}
      yMin={1}
      yMax={yMax}
      yLabel="Platz"
      invertY
      yTickStep={1}
      yTickStyle="rank"
    />
  );
}

export { colorForPlayer as _colorForPlayerForTesting };
