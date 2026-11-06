import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { buildSeasonTrend } from "@/lib/ranking/season-trend";

interface ScoredMatch {
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number | null;
  team2Score: number | null;
}

export interface DayPersonal {
  matches: number;
  wins: number;
  partnerId: string | null;
}

/** The viewer's matches and wins of one day, plus the partner they scored most points with. */
export function dayPersonal(matches: ScoredMatch[], playerId: string): DayPersonal | null {
  let played = 0;
  let wins = 0;
  const partners = new Map<string, { points: number; wins: number }>();
  for (const m of matches) {
    const t1 = [m.team1PlayerAId, m.team1PlayerBId];
    const t2 = [m.team2PlayerAId, m.team2PlayerBId];
    const side = t1.includes(playerId) ? t1 : t2.includes(playerId) ? t2 : null;
    if (!side || m.team1Score === null || m.team2Score === null) continue;
    const [own, other] = side === t1 ? [m.team1Score, m.team2Score] : [m.team2Score, m.team1Score];
    played++;
    const won = own > other;
    if (won) wins++;
    const partner = side.find((p) => p !== playerId)!;
    const cur = partners.get(partner) ?? { points: 0, wins: 0 };
    cur.points += own;
    if (won) cur.wins++;
    partners.set(partner, cur);
  }
  if (played === 0) return null;
  const best = [...partners.entries()].sort(
    ([a, x], [b, y]) => y.points - x.points || y.wins - x.wins || (a < b ? -1 : 1),
  )[0];
  return { matches: played, wins, partnerId: best?.[0] ?? null };
}

export interface ShareCardPlayer {
  name: string;
  points: number;
  rank: number;
  isMe: boolean;
}

export interface ShareCard {
  date: Date;
  groupName: string;
  dayNumber: number | null; // position among the season's finished days
  podium: ShareCardPlayer[];
  me: {
    rank: number;
    points: number;
    matches: number;
    wins: number;
    partner: string | null;
    seasonRank: number | null;
    seasonMove: number | null; // places gained with this day (positive = up)
  } | null;
}

const firstName = (name: string) => name.split(" ")[0];

/** Everything the share image needs for one finished day, from the viewer's perspective. */
export async function loadShareCard(gameDayId: string, viewerId: string): Promise<ShareCard | null> {
  const day = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    select: {
      status: true,
      seasonId: true,
      group: { select: { name: true } },
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
  if (!day || day.status !== "finished") return null;
  const summary = await computeGameDaySummary(gameDayId);
  if (!summary) return null;

  const mine = summary.rows.find((r) => r.playerId === viewerId);
  const personal = mine ? dayPersonal(day.matches, viewerId) : null;
  // The season trend is only needed for the personal part (skipped for joker days and absentees).
  const trend = personal ? await buildSeasonTrend(day.seasonId) : { days: [], players: [] };
  const dayIndex = trend.days.findIndex((d) => d.gameDayId === gameDayId);
  const ranks = trend.players.find((p) => p.playerId === viewerId)?.values ?? [];
  const seasonRank = dayIndex >= 0 ? (ranks[dayIndex] ?? null) : null;
  const before = dayIndex > 0 ? (ranks[dayIndex - 1] ?? null) : null;
  const partnerName = personal?.partnerId
    ? (await prisma.player.findUnique({ where: { id: personal.partnerId }, select: { name: true } }))?.name
    : null;

  return {
    date: summary.date,
    groupName: day.group.name,
    dayNumber: dayIndex >= 0 ? dayIndex + 1 : null,
    podium: summary.podium.map((r) => ({
      name: firstName(r.playerName),
      points: r.points,
      rank: r.rank,
      isMe: r.playerId === viewerId,
    })),
    me:
      mine && personal
        ? {
            rank: mine.rank,
            points: mine.points,
            matches: personal.matches,
            wins: personal.wins,
            partner: partnerName ? firstName(partnerName) : null,
            seasonRank,
            seasonMove: seasonRank !== null && before !== null ? before - seasonRank : null,
          }
        : null,
  };
}
