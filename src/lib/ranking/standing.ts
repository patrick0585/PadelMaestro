/** Places gained since the previous finished day (positive = up); null without two ranked days. */
export function movementByPlayer(
  players: { playerId: string; values: (number | null)[] }[],
): Map<string, number | null> {
  return new Map(
    players.map((p) => {
      const cur = p.values.at(-1) ?? null;
      const prev = p.values.length >= 2 ? (p.values.at(-2) ?? null) : null;
      return [p.playerId, cur !== null && prev !== null ? prev - cur : null];
    }),
  );
}

export type Gap = { kind: "lead"; over: number } | { kind: "behind"; gap: number; toRank: number };

/** Gap in displayed (rounded) points to the row above, or the lead over the runner-up. */
export function gapToAbove(
  ranking: { playerId: string; rank: number; points: number }[],
  playerId: string,
): Gap | null {
  const i = ranking.findIndex((r) => r.playerId === playerId);
  if (i < 0 || ranking.length < 2) return null;
  const pts = (k: number) => Math.round(ranking[k].points);
  if (i === 0) return { kind: "lead", over: pts(0) - pts(1) };
  return { kind: "behind", gap: pts(i - 1) - pts(i), toRank: ranking[i - 1].rank };
}
