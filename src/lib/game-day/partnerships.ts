// Counts how often each pair of players partnered as a team across the
// scored matches of a single game day. Used by the UI to surface fairness
// of pairing distribution.

export interface PartnershipMatch {
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number | null;
  team2Score: number | null;
}

export interface PartnershipCount {
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
  count: number;
}

export interface PartnershipPlayer {
  id: string;
  name: string;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Returns one entry per unordered pair of distinct players from the
// roster. Pairs that never partnered are returned with count=0 so the
// caller can render the "0" rows for fairness inspection. Sort: count
// desc, then alphabetically by playerAName then playerBName.
export function computePartnershipCounts(
  matches: PartnershipMatch[],
  players: PartnershipPlayer[],
): PartnershipCount[] {
  const counts = new Map<string, number>();

  for (const m of matches) {
    if (m.team1Score === null || m.team2Score === null) continue;
    const k1 = pairKey(m.team1PlayerAId, m.team1PlayerBId);
    const k2 = pairKey(m.team2PlayerAId, m.team2PlayerBId);
    counts.set(k1, (counts.get(k1) ?? 0) + 1);
    counts.set(k2, (counts.get(k2) ?? 0) + 1);
  }

  const sortedRoster = [...players].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const rows: PartnershipCount[] = [];
  for (let i = 0; i < sortedRoster.length; i++) {
    for (let j = i + 1; j < sortedRoster.length; j++) {
      const a = sortedRoster[i];
      const b = sortedRoster[j];
      rows.push({
        playerAId: a.id,
        playerBId: b.id,
        playerAName: a.name,
        playerBName: b.name,
        count: counts.get(pairKey(a.id, b.id)) ?? 0,
      });
    }
  }

  rows.sort((x, y) => {
    if (x.count !== y.count) return y.count - x.count;
    const byA = x.playerAName.localeCompare(y.playerAName, "de");
    if (byA !== 0) return byA;
    return x.playerBName.localeCompare(y.playerBName, "de");
  });

  return rows;
}
