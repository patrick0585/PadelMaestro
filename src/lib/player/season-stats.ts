import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";

export type MatchOutcome = "W" | "L" | "D";

export type TrendDelta = "up" | "down" | "flat";

export interface DayTrend {
  gameDayId: string;
  ppg: number;
  delta: TrendDelta;
}

const RECENT_DAYS_COUNT = 5;

export interface PartnerStat {
  name: string;
  pointsTogether: number;
  matches: number;
}

export interface PlayerSeasonStats {
  medals: { gold: number; silver: number; bronze: number };
  attendance: { attended: number; total: number };
  winRate: { wins: number; losses: number; draws: number; matches: number };
  recentDays: DayTrend[];
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
  jokers: { used: number; remaining: number; total: number };
}

interface MatchRow {
  matchNumber: number;
  gameDayId: string;
  gameDayDate: Date;
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number;
  team2Score: number;
}

function playerTeam(row: MatchRow, playerId: string): 1 | 2 | null {
  if (row.team1PlayerAId === playerId || row.team1PlayerBId === playerId) return 1;
  if (row.team2PlayerAId === playerId || row.team2PlayerBId === playerId) return 2;
  return null;
}

function outcomeFor(row: MatchRow, playerId: string): MatchOutcome {
  const team = playerTeam(row, playerId);
  const my = team === 1 ? row.team1Score : row.team2Score;
  const their = team === 1 ? row.team2Score : row.team1Score;
  if (my > their) return "W";
  if (my < their) return "L";
  return "D";
}

function partnerOf(row: MatchRow, playerId: string): string | null {
  const team = playerTeam(row, playerId);
  if (team === 1) {
    return row.team1PlayerAId === playerId ? row.team1PlayerBId : row.team1PlayerAId;
  }
  if (team === 2) {
    return row.team2PlayerAId === playerId ? row.team2PlayerBId : row.team2PlayerAId;
  }
  return null;
}

function myPoints(row: MatchRow, playerId: string): number {
  return playerTeam(row, playerId) === 1 ? row.team1Score : row.team2Score;
}

export async function computePlayerSeasonStats(
  playerId: string,
  seasonId: string,
): Promise<PlayerSeasonStats> {
  const [myMatches, jokerCount, finishedDayCount] = await Promise.all([
    prisma.match.findMany({
      where: {
        team1Score: { not: null },
        team2Score: { not: null },
        gameDay: { seasonId, status: "finished" },
        OR: [
          { team1PlayerAId: playerId },
          { team1PlayerBId: playerId },
          { team2PlayerAId: playerId },
          { team2PlayerBId: playerId },
        ],
      },
      select: {
        matchNumber: true,
        gameDayId: true,
        team1PlayerAId: true,
        team1PlayerBId: true,
        team2PlayerAId: true,
        team2PlayerBId: true,
        team1Score: true,
        team2Score: true,
        gameDay: { select: { date: true } },
      },
      // within a day, higher matchNumber = played later, so matchNumber DESC is newest-first
      orderBy: [{ gameDay: { date: "desc" } }, { matchNumber: "desc" }],
    }),
    prisma.jokerUse.count({ where: { playerId, seasonId } }),
    prisma.gameDay.count({ where: { seasonId, status: "finished" } }),
  ]);

  const rows: MatchRow[] = myMatches.map((m) => ({
    matchNumber: m.matchNumber,
    gameDayId: m.gameDayId,
    gameDayDate: m.gameDay.date,
    team1PlayerAId: m.team1PlayerAId,
    team1PlayerBId: m.team1PlayerBId,
    team2PlayerAId: m.team2PlayerAId,
    team2PlayerBId: m.team2PlayerBId,
    team1Score: m.team1Score as number,
    team2Score: m.team2Score as number,
  }));

  const attendedDays = new Set<string>();
  for (const r of rows) attendedDays.add(r.gameDayId);

  const summaries = await Promise.all(
    [...attendedDays].map((id) => computeGameDaySummary(id)),
  );
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const s of summaries) {
    if (!s) continue;
    const podium = s.podium;
    if (podium[0]?.playerId === playerId) medals.gold += 1;
    if (podium[1]?.playerId === playerId) medals.silver += 1;
    if (podium[2]?.playerId === playerId) medals.bronze += 1;
  }

  const winRate = { wins: 0, losses: 0, draws: 0, matches: rows.length };
  for (const r of rows) {
    const o = outcomeFor(r, playerId);
    if (o === "W") winRate.wins += 1;
    else if (o === "L") winRate.losses += 1;
    else winRate.draws += 1;
  }

  // Rows are sorted newest-first (gameDay.date DESC, matchNumber DESC),
  // so Map insertion order gives us days newest-first too.
  const perDay = new Map<string, { points: number; matches: number }>();
  for (const r of rows) {
    const cur = perDay.get(r.gameDayId) ?? { points: 0, matches: 0 };
    cur.points += myPoints(r, playerId);
    cur.matches += 1;
    perDay.set(r.gameDayId, cur);
  }
  const dayPpgList = [...perDay.entries()].map(([gameDayId, v]) => ({
    gameDayId,
    ppg: v.points / v.matches,
  }));
  const recentDays: DayTrend[] = dayPpgList.slice(0, RECENT_DAYS_COUNT).map((d, i, arr) => {
    const prev = arr[i + 1];
    const delta: TrendDelta = !prev
      ? "flat"
      : d.ppg > prev.ppg
        ? "up"
        : d.ppg < prev.ppg
          ? "down"
          : "flat";
    return { gameDayId: d.gameDayId, ppg: d.ppg, delta };
  });

  const partnerTotals = new Map<string, { pointsTogether: number; matches: number }>();
  for (const r of rows) {
    const pid = partnerOf(r, playerId);
    if (!pid) continue;
    const cur = partnerTotals.get(pid) ?? { pointsTogether: 0, matches: 0 };
    cur.pointsTogether += myPoints(r, playerId);
    cur.matches += 1;
    partnerTotals.set(pid, cur);
  }
  const partnerIds = [...partnerTotals.keys()];
  const partnerNames = partnerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: partnerIds }, deletedAt: null },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(partnerNames.map((p) => [p.id, p.name]));
  interface PartnerWithId extends PartnerStat {
    id: string;
  }
  const partners: PartnerWithId[] = partnerIds.map((pid) => {
    const stat = partnerTotals.get(pid)!;
    return { id: pid, name: nameById.get(pid) ?? "Unbekannt", ...stat };
  });
  const bestSorted = [...partners].sort((a, b) => {
    if (b.pointsTogether !== a.pointsTogether) return b.pointsTogether - a.pointsTogether;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.name.localeCompare(b.name, "de");
  });
  const worstSorted = [...partners].sort((a, b) => {
    if (a.pointsTogether !== b.pointsTogether) return a.pointsTogether - b.pointsTogether;
    if (a.matches !== b.matches) return a.matches - b.matches;
    return a.name.localeCompare(b.name, "de");
  });
  const stripId = ({ id: _id, ...rest }: PartnerWithId): PartnerStat => rest;
  const best = bestSorted[0] ?? null;
  // Guard against best and worst resolving to the same partner when ties cascade into the
  // name tiebreaker (same points, same matches, sorts identically in both directions).
  const worstCandidate = worstSorted.find((p) => p.id !== best?.id) ?? null;
  const bestPartner = best ? stripId(best) : null;
  const worstPartner = partners.length >= 2 && worstCandidate ? stripId(worstCandidate) : null;

  return {
    medals,
    attendance: { attended: attendedDays.size, total: finishedDayCount },
    winRate,
    recentDays,
    bestPartner,
    worstPartner,
    jokers: {
      used: jokerCount,
      remaining: Math.max(0, MAX_JOKERS_PER_SEASON - jokerCount),
      total: MAX_JOKERS_PER_SEASON,
    },
  };
}
