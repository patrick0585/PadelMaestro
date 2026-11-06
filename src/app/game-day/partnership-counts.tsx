import { prisma } from "@/lib/db";
import { computePartnershipCounts } from "@/lib/game-day/partnerships";
import { pairingFairness } from "@/lib/game-day/day-podium";
import { FOCUS_INSET } from "@/components/ui/focus";

// Server component: derives the roster from the players who actually
// appeared in scored matches (not from declared attendance), so a
// player who joined via "extra match" with attendance=declined still
// shows up. Hidden when there are no scored matches yet.
export async function PartnershipCounts({ gameDayId }: { gameDayId: string }) {
  const matches = await prisma.match.findMany({
    where: {
      gameDayId,
      team1Score: { not: null },
      team2Score: { not: null },
    },
    select: {
      team1PlayerAId: true,
      team1PlayerBId: true,
      team2PlayerAId: true,
      team2PlayerBId: true,
      team1Score: true,
      team2Score: true,
    },
  });
  if (matches.length === 0) return null;

  const playerIds = new Set<string>();
  for (const m of matches) {
    playerIds.add(m.team1PlayerAId);
    playerIds.add(m.team1PlayerBId);
    playerIds.add(m.team2PlayerAId);
    playerIds.add(m.team2PlayerBId);
  }
  const playerRows = await prisma.player.findMany({
    where: { id: { in: [...playerIds] } },
    select: { id: true, name: true },
  });

  const rows = computePartnershipCounts(matches, playerRows);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (max === 0) return null;

  const fairness = pairingFairness(rows.map((r) => r.count));

  return (
    <details aria-label="Häufigkeit der Team-Paarungen" className="group overflow-hidden rounded-[18px] border border-border bg-surface">
      <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 ${FOCUS_INSET}`}>
        <span>
          <b className="block text-[14.5px]">Paarungen an diesem Tag</b>
          <span className="text-xs text-foreground-muted">
            {fairness.text}
            {fairness.fair && <span className="text-lime"> · ✓ fair verteilt</span>}
          </span>
        </span>
        <span aria-hidden="true" className="text-primary transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-border px-3 py-3">
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const widthPct = max === 0 ? 0 : Math.round((r.count / max) * 100);
          return (
            <li
              key={`${r.playerAId}-${r.playerBId}`}
              className="grid grid-cols-[1fr_auto_minmax(0,2fr)] items-center gap-3 text-sm"
            >
              <span className="truncate text-foreground">
                {r.playerAName} <span className="text-foreground-muted">/</span> {r.playerBName}
              </span>
              <span className="w-4 text-right text-xs font-semibold tabular-nums text-foreground">
                {r.count}
              </span>
              <span
                aria-hidden
                className="relative h-2 overflow-hidden rounded-full bg-surface-muted"
              >
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    r.count > 0 ? "bg-primary" : "bg-border"
                  }`}
                  style={{ width: r.count > 0 ? `${widthPct}%` : "100%", opacity: r.count > 0 ? 1 : 0.35 }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      </div>
    </details>
  );
}
