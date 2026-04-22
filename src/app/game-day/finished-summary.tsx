import { computeGameDaySummary } from "@/lib/game-day/summary";

const PODIUM_STYLES = [
  { label: "1.", className: "text-warning", badge: "bg-warning/15" },
  { label: "2.", className: "text-foreground-muted", badge: "bg-foreground-muted/15" },
  { label: "3.", className: "text-primary", badge: "bg-primary/15" },
] as const;

export async function FinishedSummary({
  gameDayId,
  scoredMatchCount,
  totalMatchCount,
}: {
  gameDayId: string;
  scoredMatchCount: number;
  totalMatchCount: number;
}) {
  const summary = await computeGameDaySummary(gameDayId);

  if (!summary || summary.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Zusammenfassung
        </div>
        <div className="mt-2 text-sm text-foreground">
          Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Zusammenfassung
        </div>
        <div className="mt-1 text-sm text-foreground-muted">
          Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </div>
      </div>

      <ol aria-label="Podium" className="grid gap-2 sm:grid-cols-3">
        {summary.podium.map((row, i) => {
          const style = PODIUM_STYLES[i];
          return (
            <li
              key={row.playerId}
              className={`flex items-center gap-3 rounded-xl border border-border p-3 ${style.badge}`}
            >
              <span className={`text-xl font-extrabold tabular-nums ${style.className}`}>
                {style.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{row.playerName}</div>
                <div className="text-[0.7rem] text-foreground-muted">
                  {row.matches} {row.matches === 1 ? "Match" : "Matches"}
                </div>
              </div>
              <div className="text-2xl font-extrabold tabular-nums text-primary">{row.points}</div>
            </li>
          );
        })}
      </ol>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            <th scope="col" className="py-1.5 pr-2">#</th>
            <th scope="col" className="py-1.5 pr-2">Name</th>
            <th scope="col" className="py-1.5 pr-2 text-right">Punkte</th>
            <th scope="col" className="py-1.5 text-right">Matches</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row, i) => (
            <tr key={row.playerId} className="border-t border-border">
              <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">{i + 1}</td>
              <td className="py-1.5 pr-2 text-foreground">
                <span className="block truncate">{row.playerName}</span>
              </td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-foreground">
                {row.points}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground-muted">{row.matches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
