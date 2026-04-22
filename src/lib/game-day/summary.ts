import { prisma } from "@/lib/db";
import type { GameDayStatus } from "@prisma/client";

export interface GameDaySummaryRow {
  playerId: string;
  playerName: string;
  points: number;
  matches: number;
}

export interface GameDaySummary {
  gameDayId: string;
  date: Date;
  status: GameDayStatus;
  rows: GameDaySummaryRow[];
  podium: GameDaySummaryRow[];
}

export async function computeGameDaySummary(
  gameDayId: string,
): Promise<GameDaySummary | null> {
  const day = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    select: {
      id: true,
      date: true,
      status: true,
      matches: {
        where: { team1Score: { not: null }, team2Score: { not: null } },
        select: {
          team1PlayerAId: true,
          team1PlayerBId: true,
          team2PlayerAId: true,
          team2PlayerBId: true,
          team1Score: true,
          team2Score: true,
        },
      },
    },
  });
  if (!day) return null;

  const totals = new Map<string, { points: number; matches: number }>();
  for (const m of day.matches) {
    const t1 = m.team1Score ?? 0;
    const t2 = m.team2Score ?? 0;
    for (const pid of [m.team1PlayerAId, m.team1PlayerBId]) {
      const cur = totals.get(pid) ?? { points: 0, matches: 0 };
      cur.points += t1;
      cur.matches += 1;
      totals.set(pid, cur);
    }
    for (const pid of [m.team2PlayerAId, m.team2PlayerBId]) {
      const cur = totals.get(pid) ?? { points: 0, matches: 0 };
      cur.points += t2;
      cur.matches += 1;
      totals.set(pid, cur);
    }
  }

  const playerIds = [...totals.keys()];
  const players = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  const rows: GameDaySummaryRow[] = playerIds.map((pid) => ({
    playerId: pid,
    playerName: nameById.get(pid) ?? "Unbekannt",
    points: totals.get(pid)!.points,
    matches: totals.get(pid)!.matches,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.playerName.localeCompare(b.playerName, "de");
  });

  return {
    gameDayId: day.id,
    date: day.date,
    status: day.status,
    rows,
    podium: rows.slice(0, 3),
  };
}
