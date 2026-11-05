import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { contextFromSession } from "@/lib/auth/group-context";
import { NoGroupNotice } from "@/components/no-group-notice";
import { Archive } from "lucide-react";
import { listArchivedGameDays, type ArchivedGameDayRow } from "@/lib/archive/list";
import { computeRanking, type RankingRow } from "@/lib/ranking/compute";
import { LABEL } from "@/components/home/styles";
import { SeasonSection, type SeasonSectionData } from "./season-section";

export const dynamic = "force-dynamic";

// rows kommen nach Datum absteigend sortiert — die Insertion-Order der
// Sections entspricht damit „neueste Saison zuerst".
function groupBySeason(rows: ArchivedGameDayRow[]): SeasonSectionData[] {
  const sections = new Map<string, SeasonSectionData>();
  for (const row of rows) {
    const section = sections.get(row.seasonId);
    if (section) section.rows.push(row);
    else
      sections.set(row.seasonId, {
        seasonId: row.seasonId,
        seasonName: row.seasonName,
        seasonIsActive: row.seasonIsActive,
        rows: [row],
      });
  }
  return [...sections.values()];
}

export default async function ArchivePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;

  const rows = await listArchivedGameDays(ctx.groupId, session.user.id);

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        <Header />
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

  const sections = groupBySeason(rows);
  const finalTables = new Map<string, RankingRow[]>();
  for (const section of sections) {
    if (!section.seasonIsActive) {
      finalTables.set(section.seasonId, await computeRanking(section.seasonId));
    }
  }

  return (
    <div className="space-y-5">
      <Header />

      {sections.map((section) => (
        <SeasonSection key={section.seasonId} section={section} ranking={finalTables.get(section.seasonId) ?? null} />
      ))}
    </div>
  );
}

function Header() {
  return (
    <header>
      <p className={LABEL}>Vergangene Spieltage</p>
      <h1 className="font-display text-3xl font-extrabold">Archiv</h1>
    </header>
  );
}
