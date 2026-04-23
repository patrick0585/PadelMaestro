import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";

export interface ArchivePodiumEntry {
  playerName: string;
  points: number;
}

export interface ArchivedGameDayRow {
  id: string;
  date: Date;
  seasonYear: number;
  matchCount: number;
  playerCount: number;
  jokerCount: number;
  podium: ArchivePodiumEntry[];
  self: { points: number; matches: number } | null;
}

export async function listArchivedGameDays(
  currentPlayerId: string | null,
): Promise<ArchivedGameDayRow[]> {
  const days = await prisma.gameDay.findMany({
    where: { status: "finished" },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      date: true,
      _count: {
        select: {
          matches: { where: { team1Score: { not: null }, team2Score: { not: null } } },
        },
      },
    },
  });
  if (days.length === 0) return [];

  const [summaries, jokerCounts] = await Promise.all([
    Promise.all(days.map((d) => computeGameDaySummary(d.id))),
    prisma.jokerUse.groupBy({
      by: ["gameDayId"],
      where: { gameDayId: { in: days.map((d) => d.id) } },
      _count: { _all: true },
    }),
  ]);
  const jokerByDay = new Map(
    jokerCounts.map((r) => [r.gameDayId, r._count._all]),
  );

  const rows: ArchivedGameDayRow[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const summary = summaries[i];
    const rowsFromSummary = summary?.rows ?? [];
    const podium = (summary?.podium ?? []).map((r) => ({
      playerName: r.playerName,
      points: r.points,
    }));
    const selfRow =
      currentPlayerId !== null
        ? rowsFromSummary.find((r) => r.playerId === currentPlayerId)
        : undefined;
    const self = selfRow ? { points: selfRow.points, matches: selfRow.matches } : null;
    rows.push({
      id: day.id,
      date: day.date,
      seasonYear: day.date.getUTCFullYear(),
      matchCount: day._count.matches,
      playerCount: rowsFromSummary.length,
      jokerCount: jokerByDay.get(day.id) ?? 0,
      podium,
      self,
    });
  }
  return rows;
}
