import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";

export type MatchOutcome = "W" | "L" | "D";

export interface PartnerStat {
  name: string;
  pointsTogether: number;
  matches: number;
}

export interface PlayerSeasonStats {
  medals: { gold: number; silver: number; bronze: number };
  attendance: { attended: number; total: number };
  winRate: { wins: number; losses: number; draws: number; matches: number };
  recentForm: MatchOutcome[];
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
  jokers: { used: number; remaining: number; total: number };
}

interface MatchRow {
  matchNumber: number;
  gameDayDate: Date;
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number;
  team2Score: number;
}

function outcomeFor(row: MatchRow, playerId: string): MatchOutcome {
  const onTeam1 = row.team1PlayerAId === playerId || row.team1PlayerBId === playerId;
  const my = onTeam1 ? row.team1Score : row.team2Score;
  const their = onTeam1 ? row.team2Score : row.team1Score;
  if (my > their) return "W";
  if (my < their) return "L";
  return "D";
}

function partnerOf(row: MatchRow, playerId: string): string | null {
  if (row.team1PlayerAId === playerId) return row.team1PlayerBId;
  if (row.team1PlayerBId === playerId) return row.team1PlayerAId;
  if (row.team2PlayerAId === playerId) return row.team2PlayerBId;
  if (row.team2PlayerBId === playerId) return row.team2PlayerAId;
  return null;
}

function myPoints(row: MatchRow, playerId: string): number {
  const onTeam1 = row.team1PlayerAId === playerId || row.team1PlayerBId === playerId;
  return onTeam1 ? row.team1Score : row.team2Score;
}

export async function computePlayerSeasonStats(
  playerId: string,
  seasonId: string,
): Promise<PlayerSeasonStats> {
  const [finishedDays, myMatches, jokerCount] = await Promise.all([
    prisma.gameDay.findMany({
      where: { seasonId, status: "finished" },
      select: { id: true },
      orderBy: { date: "desc" },
    }),
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
        team1PlayerAId: true,
        team1PlayerBId: true,
        team2PlayerAId: true,
        team2PlayerBId: true,
        team1Score: true,
        team2Score: true,
        gameDay: { select: { date: true } },
      },
      orderBy: [{ gameDay: { date: "desc" } }, { matchNumber: "desc" }],
    }),
    prisma.jokerUse.count({ where: { playerId, seasonId } }),
  ]);

  const rows: MatchRow[] = myMatches.map((m) => ({
    matchNumber: m.matchNumber,
    gameDayDate: m.gameDay.date,
    team1PlayerAId: m.team1PlayerAId,
    team1PlayerBId: m.team1PlayerBId,
    team2PlayerAId: m.team2PlayerAId,
    team2PlayerBId: m.team2PlayerBId,
    team1Score: m.team1Score as number,
    team2Score: m.team2Score as number,
  }));

  const summaries = await Promise.all(finishedDays.map((d) => computeGameDaySummary(d.id)));
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const s of summaries) {
    if (!s) continue;
    const podium = s.podium;
    if (podium[0]?.playerId === playerId) medals.gold += 1;
    if (podium[1]?.playerId === playerId) medals.silver += 1;
    if (podium[2]?.playerId === playerId) medals.bronze += 1;
  }

  const attendedRows = await prisma.match.findMany({
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
    select: { gameDayId: true },
  });
  const attendedDays = new Set<string>();
  for (const r of attendedRows) attendedDays.add(r.gameDayId);

  const winRate = { wins: 0, losses: 0, draws: 0, matches: rows.length };
  for (const r of rows) {
    const o = outcomeFor(r, playerId);
    if (o === "W") winRate.wins += 1;
    else if (o === "L") winRate.losses += 1;
    else winRate.draws += 1;
  }

  const recentForm: MatchOutcome[] = rows.slice(0, 5).map((r) => outcomeFor(r, playerId));

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
        where: { id: { in: partnerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(partnerNames.map((p) => [p.id, p.name]));
  const partners: PartnerStat[] = partnerIds.map((pid) => ({
    name: nameById.get(pid) ?? "Unbekannt",
    pointsTogether: partnerTotals.get(pid)!.pointsTogether,
    matches: partnerTotals.get(pid)!.matches,
  }));
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
  const bestPartner = bestSorted[0] ?? null;
  const worstPartner = partners.length >= 2 ? worstSorted[0] ?? null : null;

  return {
    medals,
    attendance: { attended: attendedDays.size, total: finishedDays.length },
    winRate,
    recentForm,
    bestPartner,
    worstPartner,
    jokers: {
      used: jokerCount,
      remaining: Math.max(0, MAX_JOKERS_PER_SEASON - jokerCount),
      total: MAX_JOKERS_PER_SEASON,
    },
  };
}
