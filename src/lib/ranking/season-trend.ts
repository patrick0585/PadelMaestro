import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";

export interface SeasonTrendDay {
  gameDayId: string;
  date: Date;
  totalPlayers: number;
}

export interface SeasonTrendPlayer {
  playerId: string;
  name: string;
  // One entry per day in `days`, in the same order. `null` means the
  // player did not play on that day; otherwise the value is their
  // 1-based placement (index 0 of computeGameDaySummary's sorted rows + 1).
  values: (number | null)[];
}

export interface SeasonTrend {
  days: SeasonTrendDay[];
  players: SeasonTrendPlayer[];
}

/**
 * Build per-player placement-over-time data for the season's finished
 * game days. Reuses computeGameDaySummary (the same function the
 * dashboard, ranking, and medal counts use), so placements here are by
 * definition the same as everywhere else in the app — no chance of
 * sort/tie-break drift.
 *
 * Days are returned oldest-first; chart consumers read left→right
 * chronologically so the season story flows naturally.
 */
export async function buildSeasonTrend(seasonId: string): Promise<SeasonTrend> {
  const finishedDays = await prisma.gameDay.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });
  if (finishedDays.length === 0) {
    return { days: [], players: [] };
  }

  const summaries = await Promise.all(
    finishedDays.map((d) => computeGameDaySummary(d.id)),
  );
  const validSummaries = summaries.filter(
    (s): s is NonNullable<typeof s> => s !== null,
  );

  const days: SeasonTrendDay[] = validSummaries.map((s) => ({
    gameDayId: s.gameDayId,
    date: s.date,
    totalPlayers: s.rows.length,
  }));

  // Collect every player who appeared in any summary, with their name.
  // Later occurrences win (most recent name wins on a rename), which is
  // the same convention the rest of the app inherits from the latest
  // computeGameDaySummary call.
  const playerInfo = new Map<string, string>();
  for (const s of validSummaries) {
    for (const r of s.rows) playerInfo.set(r.playerId, r.playerName);
  }

  const players: SeasonTrendPlayer[] = [...playerInfo.entries()].map(
    ([playerId, name]) => ({
      playerId,
      name,
      values: validSummaries.map((s) => {
        const idx = s.rows.findIndex((r) => r.playerId === playerId);
        return idx < 0 ? null : idx + 1;
      }),
    }),
  );

  return { days, players };
}
