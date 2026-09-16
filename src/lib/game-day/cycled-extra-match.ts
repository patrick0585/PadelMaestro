// On 4- and 5-player days an extra match repeats the start plan from the
// top: match 16 copies match 1, 17 copies 2, and so on. Players keep the
// rotation they already know instead of getting a freshly picked pairing.
// 6-player days still use the fair picker (see fair-extra-match.ts).

export const CYCLED_PLAYER_COUNTS: ReadonlySet<number> = new Set([4, 5]);

export interface CycledMatchRow {
  readonly matchNumber: number;
  readonly team1PlayerAId: string;
  readonly team1PlayerBId: string;
  readonly team2PlayerAId: string;
  readonly team2PlayerBId: string;
}

function pairingKey(m: CycledMatchRow): string {
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const t1 = pair(m.team1PlayerAId, m.team1PlayerBId);
  const t2 = pair(m.team2PlayerAId, m.team2PlayerBId);
  return t1 < t2 ? `${t1}#${t2}` : `${t2}#${t1}`;
}

// Returns the template match the next extra match should copy: the one
// following the pairing of the last match on the list. Deriving it from
// content instead of matchNumber keeps the cycle intact when a removed
// extra match causes the trailing ones to be renumbered.
export function pickCycledExtraMatch<T extends CycledMatchRow>(
  matches: ReadonlyArray<T>,
  templateTotal: number,
): T {
  const template = matches
    .filter((m) => m.matchNumber <= templateTotal)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (template.length !== templateTotal) {
    throw new Error(`expected ${templateTotal} template matches, found ${template.length}`);
  }

  const last = matches.reduce((a, b) => (b.matchNumber > a.matchNumber ? b : a));
  const lastKey = pairingKey(last);
  const idx = template.findIndex((m) => pairingKey(m) === lastKey);
  if (idx === -1) {
    throw new Error(`match ${last.matchNumber} does not match any template pairing`);
  }
  return template[(idx + 1) % templateTotal];
}
