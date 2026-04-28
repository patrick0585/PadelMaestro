import { prisma } from "@/lib/db";

export interface DayLiveStandingsRow {
  playerId: string;
  playerName: string;
  avatarVersion: number;
  rank: number;
  previousRank: number | null;
  points: number;
  matches: number;
}

export interface DayLiveStandings {
  rows: DayLiveStandingsRow[];
  scoredMatchCount: number;
  totalMatchCount: number;
  hasPreviousState: boolean;
}

interface ScoredMatch {
  id: string;
  scoredAt: Date | null;
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number;
  team2Score: number;
}

interface PlayerLite {
  id: string;
  name: string;
  avatarVersion: number;
}

interface Total {
  points: number;
  matches: number;
}

interface SortableRow {
  playerId: string;
  playerName: string;
  points: number;
  matches: number;
}

function tally(matches: ScoredMatch[]): Map<string, Total> {
  const totals = new Map<string, Total>();
  const credit = (pids: string[], score: number) => {
    for (const pid of pids) {
      const cur = totals.get(pid) ?? { points: 0, matches: 0 };
      cur.points += score;
      cur.matches += 1;
      totals.set(pid, cur);
    }
  };
  for (const m of matches) {
    credit([m.team1PlayerAId, m.team1PlayerBId], m.team1Score);
    credit([m.team2PlayerAId, m.team2PlayerBId], m.team2Score);
  }
  return totals;
}

function sortStandings(rows: SortableRow[]): SortableRow[] {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.playerName.localeCompare(b.playerName, "de");
  });
}

// Competition ranking: equal points + matches share the same rank, the
// next distinct row jumps by the size of the cluster (1, 2, 2, 4).
function assignRanks(sorted: SortableRow[]): Map<string, number> {
  const ranks = new Map<string, number>();
  let lastRank = 0;
  let lastPoints = Number.NaN;
  let lastMatches = Number.NaN;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.points !== lastPoints || r.matches !== lastMatches) {
      lastRank = i + 1;
      lastPoints = r.points;
      lastMatches = r.matches;
    }
    ranks.set(r.playerId, lastRank);
  }
  return ranks;
}

function pickLatest(matches: ScoredMatch[]): ScoredMatch | null {
  let best: ScoredMatch | null = null;
  for (const m of matches) {
    if (!m.scoredAt) continue;
    if (!best) {
      best = m;
      continue;
    }
    const mt = m.scoredAt.getTime();
    const bt = best.scoredAt!.getTime();
    if (mt > bt || (mt === bt && m.id > best.id)) {
      best = m;
    }
  }
  return best;
}

export function deriveLiveStandings(
  matches: ScoredMatch[],
  players: PlayerLite[],
  totalMatchCount: number,
): DayLiveStandings {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const versionById = new Map(players.map((p) => [p.id, p.avatarVersion]));

  const latest = pickLatest(matches);
  const previousMatches = latest
    ? matches.filter((m) => m.id !== latest.id)
    : [];
  const hasPreviousState = latest !== null && previousMatches.length > 0;

  const buildRows = (totals: Map<string, Total>): SortableRow[] =>
    [...totals.entries()].map(([playerId, t]) => ({
      playerId,
      playerName: nameById.get(playerId) ?? "Unbekannt",
      points: t.points,
      matches: t.matches,
    }));

  const currentSorted = sortStandings(buildRows(tally(matches)));
  const currentRanks = assignRanks(currentSorted);
  const previousRanks = hasPreviousState
    ? assignRanks(sortStandings(buildRows(tally(previousMatches))))
    : null;

  const rows: DayLiveStandingsRow[] = currentSorted.map((r) => ({
    playerId: r.playerId,
    playerName: r.playerName,
    avatarVersion: versionById.get(r.playerId) ?? 0,
    rank: currentRanks.get(r.playerId)!,
    previousRank: previousRanks ? (previousRanks.get(r.playerId) ?? null) : null,
    points: r.points,
    matches: r.matches,
  }));

  return {
    rows,
    scoredMatchCount: matches.length,
    totalMatchCount,
    hasPreviousState,
  };
}

export async function computeDayLiveStandings(
  gameDayId: string,
): Promise<DayLiveStandings | null> {
  const day = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    select: {
      matches: {
        select: {
          id: true,
          scoredAt: true,
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

  const totalMatchCount = day.matches.length;
  const scored: ScoredMatch[] = day.matches
    .filter(
      (m): m is typeof m & { team1Score: number; team2Score: number } =>
        m.team1Score !== null && m.team2Score !== null,
    )
    .map((m) => ({
      id: m.id,
      scoredAt: m.scoredAt,
      team1PlayerAId: m.team1PlayerAId,
      team1PlayerBId: m.team1PlayerBId,
      team2PlayerAId: m.team2PlayerAId,
      team2PlayerBId: m.team2PlayerBId,
      team1Score: m.team1Score,
      team2Score: m.team2Score,
    }));

  const playerIds = [
    ...new Set(
      scored.flatMap((m) => [
        m.team1PlayerAId,
        m.team1PlayerBId,
        m.team2PlayerAId,
        m.team2PlayerBId,
      ]),
    ),
  ];
  const players: PlayerLite[] = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, name: true, avatarVersion: true },
      })
    : [];

  return deriveLiveStandings(scored, players, totalMatchCount);
}
