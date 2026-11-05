/** Minimum shared matches for a partner to count as best/worst duo. */
export const MIN_DUO_MATCHES = 3;

interface PartnerLike {
  id: string;
  name: string;
  pointsTogether: number;
  matches: number;
}

const avg = (p: PartnerLike) => p.pointsTogether / p.matches;

function byAverage(a: PartnerLike, b: PartnerLike): number {
  const d = avg(b) - avg(a);
  if (Math.abs(d) > 1e-9) return d;
  if (b.matches !== a.matches) return b.matches - a.matches;
  return a.name.localeCompare(b.name, "de");
}

/**
 * Sorts partners by points per shared match, those with at least MIN_DUO_MATCHES first.
 * Best/worst come from that group; only when no partner qualifies do all partners count.
 */
export function rankPartners<T extends PartnerLike>(partners: T[]): { best: T | null; worst: T | null; sorted: T[] } {
  const eligible = partners.filter((p) => p.matches >= MIN_DUO_MATCHES).sort(byAverage);
  const rest = partners.filter((p) => p.matches < MIN_DUO_MATCHES).sort(byAverage);
  const pool = eligible.length > 0 ? eligible : rest;
  return {
    best: pool[0] ?? null,
    worst: pool.length >= 2 ? pool[pool.length - 1] : null,
    sorted: [...eligible, ...rest],
  };
}
