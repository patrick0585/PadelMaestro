import { prisma } from "@/lib/db";

export interface SeasonTrendDay {
  gameDayId: string;
  date: Date;
}

export interface SeasonTrendPlayer {
  playerId: string;
  name: string;
  // One entry per day in `days`, in the same order. The value is the
  // player's cumulative season rank as of the END of that day (1 = top
  // of the table). `null` means the player had not yet appeared in any
  // ranking criterion (no matches and no joker uses) up to and
  // including that day — render this as a gap in the line.
  values: (number | null)[];
}

export interface SeasonTrend {
  days: SeasonTrendDay[];
  players: SeasonTrendPlayer[];
  totalPlayers: number; // distinct active players in the season — Y-axis bound
}

interface PlayerTotals {
  points: number;
  games: number;
}

// Mirrors the ORDER BY in computeRanking's raw SQL exactly:
//   points DESC, points/games DESC NULLS LAST
// Players who are fully tied keep their relative input order, same as
// PostgreSQL's behaviour for unspecified ORDER BY ties.
function compareRanking(
  a: { points: number; games: number },
  b: { points: number; games: number },
): number {
  if (b.points !== a.points) return b.points - a.points;
  const aPpg = a.games > 0 ? a.points / a.games : null;
  const bPpg = b.games > 0 ? b.points / b.games : null;
  if (aPpg === null && bPpg === null) return 0;
  if (aPpg === null) return 1;
  if (bPpg === null) return -1;
  return bPpg - aPpg;
}

/**
 * Build per-player cumulative-rank-over-time data for the season.
 *
 * For each finished game day chronologically, computes the season
 * standings as of the end of that day (using the same sort as
 * computeRanking: points DESC, ppg DESC NULLS LAST) and records each
 * player's rank. Joker uses are credited on the day they apply to.
 *
 * A player's value is `null` until they have played their first match
 * (or used their first joker) in the season — they cannot be ranked
 * before they appear in the criteria.
 */
export async function buildSeasonTrend(seasonId: string): Promise<SeasonTrend> {
  const finishedDays = await prisma.gameDay.findMany({
    where: { seasonId, status: "finished" },
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });
  if (finishedDays.length === 0) {
    return { days: [], players: [], totalPlayers: 0 };
  }

  const matches = await prisma.match.findMany({
    where: {
      gameDay: { seasonId, status: "finished" },
      team1Score: { not: null },
      team2Score: { not: null },
    },
    select: {
      gameDayId: true,
      team1PlayerAId: true,
      team1PlayerBId: true,
      team2PlayerAId: true,
      team2PlayerBId: true,
      team1Score: true,
      team2Score: true,
    },
  });

  // Restrict jokers to finished days. computeRanking's SQL counts all
  // season jokers regardless of day status, but for the historical
  // chart, a joker attributed to a still-planned day has no place on
  // any past-day cumulative — and including its player in `validIds`
  // would silently inflate the Y-axis bound (the player's whole row
  // would be all-null, but `totalPlayers` would grow by one).
  const jokerUses = await prisma.jokerUse.findMany({
    where: { seasonId, gameDay: { status: "finished" } },
    select: {
      playerId: true,
      gameDayId: true,
      gamesCredited: true,
      pointsCredited: true,
    },
  });

  const playerIds = new Set<string>();
  for (const m of matches) {
    playerIds.add(m.team1PlayerAId);
    playerIds.add(m.team1PlayerBId);
    playerIds.add(m.team2PlayerAId);
    playerIds.add(m.team2PlayerBId);
  }
  for (const j of jokerUses) playerIds.add(j.playerId);

  const playerRows = await prisma.player.findMany({
    where: { id: { in: [...playerIds] } },
    select: { id: true, name: true, deletedAt: true },
  });
  // Mirror computeRanking: deleted players are excluded from the table.
  const activePlayers = playerRows.filter((p) => p.deletedAt === null);
  const validIds = new Set(activePlayers.map((p) => p.id));
  const nameById = new Map(activePlayers.map((p) => [p.id, p.name]));

  // Group match contributions by day.
  const matchTotalsByDay = new Map<string, Map<string, PlayerTotals>>();
  for (const d of finishedDays) matchTotalsByDay.set(d.id, new Map());
  const credit = (
    dayMap: Map<string, PlayerTotals>,
    pids: string[],
    score: number,
  ) => {
    for (const pid of pids) {
      if (!validIds.has(pid)) continue;
      const cur = dayMap.get(pid) ?? { points: 0, games: 0 };
      cur.points += score;
      cur.games += 1;
      dayMap.set(pid, cur);
    }
  };
  for (const m of matches) {
    const dayMap = matchTotalsByDay.get(m.gameDayId);
    if (!dayMap) continue;
    credit(dayMap, [m.team1PlayerAId, m.team1PlayerBId], m.team1Score ?? 0);
    credit(dayMap, [m.team2PlayerAId, m.team2PlayerBId], m.team2Score ?? 0);
  }

  // Group joker contributions by day. pointsCredited is Decimal in Prisma;
  // Number() round-trips through string to a JS float, matching the SQL
  // ::float cast computeRanking uses.
  const jokerTotalsByDay = new Map<string, Map<string, PlayerTotals>>();
  for (const d of finishedDays) jokerTotalsByDay.set(d.id, new Map());
  for (const j of jokerUses) {
    if (!validIds.has(j.playerId)) continue;
    const dayMap = jokerTotalsByDay.get(j.gameDayId);
    if (!dayMap) continue;
    const cur = dayMap.get(j.playerId) ?? { points: 0, games: 0 };
    cur.points += Number(j.pointsCredited);
    cur.games += j.gamesCredited;
    dayMap.set(j.playerId, cur);
  }

  // Walk days oldest→newest, accumulate, rank, record each player's rank.
  const cumulative = new Map<string, PlayerTotals>();
  const valuesByPlayer = new Map<string, (number | null)[]>();
  for (const id of validIds) valuesByPlayer.set(id, []);

  for (const day of finishedDays) {
    for (const [pid, t] of matchTotalsByDay.get(day.id)!) {
      const cur = cumulative.get(pid) ?? { points: 0, games: 0 };
      cur.points += t.points;
      cur.games += t.games;
      cumulative.set(pid, cur);
    }
    for (const [pid, t] of jokerTotalsByDay.get(day.id)!) {
      const cur = cumulative.get(pid) ?? { points: 0, games: 0 };
      cur.points += t.points;
      cur.games += t.games;
      cumulative.set(pid, cur);
    }

    const ranked = [...cumulative.entries()]
      .map(([playerId, t]) => ({ playerId, ...t }))
      .sort(compareRanking);
    const rankByPlayer = new Map<string, number>();
    ranked.forEach((r, idx) => rankByPlayer.set(r.playerId, idx + 1));

    for (const id of validIds) {
      const r = rankByPlayer.get(id);
      valuesByPlayer.get(id)!.push(r ?? null);
    }
  }

  const players: SeasonTrendPlayer[] = [...validIds].map((id) => ({
    playerId: id,
    name: nameById.get(id) ?? "Unbekannt",
    values: valuesByPlayer.get(id)!,
  }));

  return {
    days: finishedDays.map((d) => ({ gameDayId: d.id, date: d.date })),
    players,
    totalPlayers: activePlayers.length,
  };
}

export { compareRanking as _compareRankingForTesting };
