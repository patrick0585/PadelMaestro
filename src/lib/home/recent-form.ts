import { prisma } from "@/lib/db";

const DAYS = 5;

/**
 * PPG per player for the last finished game days of the season, oldest first.
 * `null` marks a day the player did not play. Players without any match are omitted.
 */
export async function recentFormByPlayer(
  seasonId: string,
  playerIds: string[],
): Promise<Map<string, (number | null)[]>> {
  const days = await prisma.gameDay.findMany({
    where: { seasonId, status: "finished" },
    orderBy: { date: "desc" },
    take: DAYS,
    select: {
      id: true,
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
  days.reverse();

  const wanted = new Set(playerIds);
  const form = new Map<string, (number | null)[]>();
  days.forEach((day, i) => {
    const totals = new Map<string, { points: number; matches: number }>();
    const add = (id: string, points: number) => {
      if (!wanted.has(id)) return;
      const t = totals.get(id) ?? { points: 0, matches: 0 };
      t.points += points;
      t.matches += 1;
      totals.set(id, t);
    };
    for (const m of day.matches) {
      add(m.team1PlayerAId, m.team1Score as number);
      add(m.team1PlayerBId, m.team1Score as number);
      add(m.team2PlayerAId, m.team2Score as number);
      add(m.team2PlayerBId, m.team2Score as number);
    }
    for (const [id, t] of totals) {
      const row = form.get(id) ?? new Array<number | null>(days.length).fill(null);
      row[i] = t.points / t.matches;
      form.set(id, row);
    }
  });
  return form;
}
