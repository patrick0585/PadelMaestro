import { prisma } from "@/lib/db";
import { computeRanking } from "@/lib/ranking/compute";

export interface PlayerPass {
  memberSince: Date | null;
  seasonName: string | null;
  stats: { rank: number; ppg: number; attended: number; medals: { gold: number; silver: number; bronze: number } } | null;
}

// Memberships were backfilled when groups were introduced, so joinedAt can be
// later than a founding member's first game day — take whichever is earlier.
// Any participant row counts, regardless of attendance.
export async function loadPlayerPass(playerId: string, groupId: string): Promise<PlayerPass> {
  const [membership, firstDay, season] = await Promise.all([
    prisma.membership.findUnique({
      where: { groupId_playerId: { groupId, playerId } },
      select: { joinedAt: true },
    }),
    prisma.gameDay.findFirst({
      where: { groupId, participants: { some: { playerId } } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.season.findFirst({ where: { groupId, isActive: true }, select: { id: true, name: true } }),
  ]);

  const candidates = [membership?.joinedAt, firstDay?.date].filter((d): d is Date => d != null);
  const memberSince = candidates.length ? new Date(Math.min(...candidates.map((d) => d.getTime()))) : null;

  if (!season) return { memberSince, seasonName: null, stats: null };

  const [ranking, attended] = await Promise.all([
    computeRanking(season.id),
    // Same definition as the season stats: finished days with a scored match.
    prisma.gameDay.count({
      where: {
        seasonId: season.id,
        status: "finished",
        matches: {
          some: {
            team1Score: { not: null },
            team2Score: { not: null },
            OR: [
              { team1PlayerAId: playerId },
              { team1PlayerBId: playerId },
              { team2PlayerAId: playerId },
              { team2PlayerBId: playerId },
            ],
          },
        },
      },
    }),
  ]);
  const mine = ranking.find((r) => r.playerId === playerId);
  const stats = mine && mine.games > 0 ? { rank: mine.rank, ppg: mine.pointsPerGame, attended, medals: mine.medals } : null;
  return { memberSince, seasonName: season.name, stats };
}

const MONTH_YEAR = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function formatMemberSince(date: Date): string {
  return `Dabei seit ${MONTH_YEAR.format(date)}`;
}
