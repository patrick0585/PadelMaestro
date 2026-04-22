import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { FinishedSummary } from "@/app/game-day/finished-summary";
import { formatGameDayDate } from "@/lib/archive/format";
import { ReadOnlyMatchCard } from "../read-only-match-card";

export const dynamic = "force-dynamic";

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) notFound();

  const day = await prisma.gameDay.findUnique({
    where: { id },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
        include: {
          team1PlayerA: { select: { name: true } },
          team1PlayerB: { select: { name: true } },
          team2PlayerA: { select: { name: true } },
          team2PlayerB: { select: { name: true } },
        },
      },
    },
  });

  if (!day || day.status !== "finished") notFound();

  const scoredMatchCount = day.matches.filter(
    (m) => m.team1Score !== null && m.team2Score !== null,
  ).length;

  return (
    <div className="space-y-4">
      <Link
        href="/archive"
        className="inline-flex items-center gap-1 rounded text-xs font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        Zurück zum Archiv
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Spieltag beendet
        </p>
        <h1 className="text-2xl font-bold text-foreground">{formatGameDayDate(day.date)}</h1>
      </header>

      {/* FinishedSummary internally calls computeGameDaySummary(day.id) */}
      <FinishedSummary
        gameDayId={day.id}
        scoredMatchCount={scoredMatchCount}
        totalMatchCount={day.matches.length}
      />

      {day.matches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Paarungen
          </h2>
          <div className="space-y-2">
            {day.matches.map((m) => (
              <ReadOnlyMatchCard
                key={m.id}
                match={{
                  matchNumber: m.matchNumber,
                  team1A: m.team1PlayerA.name,
                  team1B: m.team1PlayerB.name,
                  team2A: m.team2PlayerA.name,
                  team2B: m.team2PlayerB.name,
                  team1Score: m.team1Score,
                  team2Score: m.team2Score,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
