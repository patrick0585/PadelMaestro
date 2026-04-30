import { prisma } from "@/lib/db";
import { computePartnershipCounts } from "@/lib/game-day/partnerships";

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

  return (
    <section
      aria-label="Häufigkeit der Team-Paarungen"
      className="space-y-2 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="space-y-1">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Paarungen an diesem Tag
        </div>
        <p className="text-xs leading-snug text-foreground-muted">
          Zeigt alle Team-Paarungen dieses Spieltags – so siehst du auf einen
          Blick, ob die Verteilung fair war.
        </p>
      </div>
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
    </section>
  );
}
