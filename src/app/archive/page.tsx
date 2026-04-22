import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive } from "lucide-react";
import { listArchivedGameDays, type ArchivedGameDayRow } from "@/lib/archive/list";
import { formatGameDayDate } from "@/lib/archive/format";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

function groupBySeason(rows: ArchivedGameDayRow[]): Map<number, ArchivedGameDayRow[]> {
  const grouped = new Map<number, ArchivedGameDayRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.seasonYear);
    if (bucket) bucket.push(row);
    else grouped.set(row.seasonYear, [row]);
  }
  return grouped;
}

export default async function ArchivePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const rows = await listArchivedGameDays(session.user.id);

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Vergangene Spieltage
          </p>
          <h1 className="text-2xl font-bold text-foreground">Archiv</h1>
        </header>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
          <Archive className="h-10 w-10 text-foreground-muted" aria-hidden="true" />
          <div className="text-sm font-semibold text-foreground">
            Noch keine abgeschlossenen Spieltage.
          </div>
          <div className="text-xs text-foreground-muted">
            Sobald ein Spieltag beendet ist, erscheint er hier.
          </div>
        </div>
      </div>
    );
  }

  const grouped = groupBySeason(rows);
  const years = [...grouped.keys()].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Vergangene Spieltage
        </p>
        <h1 className="text-2xl font-bold text-foreground">Archiv</h1>
      </header>

      {years.map((year) => (
        <section key={year} className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            {year}
          </h2>
          <ul className="space-y-2">
            {(grouped.get(year) ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  href={`/archive/${row.id}`}
                  className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="text-sm font-semibold text-foreground">{formatGameDayDate(row.date)}</div>
                  {row.podium.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
                      {row.podium.map((p, i) => (
                        <span key={p.playerName} className="inline-flex items-center gap-1">
                          <span aria-hidden="true">{MEDALS[i]}</span>
                          <span className="font-medium">{p.playerName}</span>
                          <span className="tabular-nums text-foreground-muted">{p.points}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-foreground-muted">
                    {row.matchCount} {row.matchCount === 1 ? "Match" : "Matches"} ·{" "}
                    {row.playerCount} Spieler
                    {row.self && (
                      <>
                        {" · "}Du: {row.self.points} Pt /{" "}
                        {row.self.matches} {row.self.matches === 1 ? "Match" : "Matches"}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
