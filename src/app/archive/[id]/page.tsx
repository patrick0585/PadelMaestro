import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { contextFromSession } from "@/lib/auth/group-context";
import { NoGroupNotice } from "@/components/no-group-notice";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { FinishedSummary } from "@/app/game-day/finished-summary";
import { LABEL, TICKET_HEAD, TICKET_PILL } from "@/components/home/styles";
import { MatchRows } from "@/app/game-day/match-rows";
import { toRowMatch } from "@/app/game-day/row-match";
import { describeRule, ruleForGameDay } from "@/lib/scoring/rule";
import { formatGameDayHeading } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;

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
          scoredBy: { select: { name: true } },
        },
      },
      season: { select: { name: true } },
    },
  });

  if (!day || day.status !== "finished" || day.groupId !== ctx.groupId) notFound();

  const rows = day.matches.map((m) => toRowMatch(m, false));
  const scoredMatchCount = rows.filter((m) => m.team1Score !== null && m.team2Score !== null).length;
  const playerIds = new Set(
    day.matches.flatMap((m) => [m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId]),
  );
  const rule = ruleForGameDay(day);
  const me = await prisma.player.findUnique({ where: { id: session.user.id }, select: { name: true } });

  return (
    <div className="space-y-4">
      <Link
        href="/archive"
        className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Archiv
      </Link>

      <section className="ticket">
        <div className={TICKET_HEAD}>
          <span className="truncate">Spieltag · {day.season.name}</span>
          <span className={TICKET_PILL}>Abpfiff</span>
        </div>
        <h1 className="mt-1.5 font-display text-[34px] font-extrabold leading-none text-white">{formatGameDayHeading(day.date)}</h1>
        <div className="ticket-perf" />
        <dl className="grid grid-cols-3 text-center text-[#e2f8ff]">
          <Stat label="Spieler" value={String(playerIds.size)} />
          <Stat label="gewertet" value={`${scoredMatchCount}/${rows.length}`} />
          <Stat label="Wertung" value={describeRule(rule)} small />
        </dl>
      </section>

      {/* FinishedSummary internally calls computeGameDaySummary(day.id) */}
      <FinishedSummary
        gameDayId={day.id}
        scoredMatchCount={scoredMatchCount}
        totalMatchCount={rows.length}
        meId={session.user.id}
      />

      {rows.length > 0 && (
        <section aria-labelledby="pairings" className="space-y-2">
          <h2 id="pairings" className={`px-1 ${LABEL}`}>
            Alle Matches · {rows.length}
          </h2>
          <div className="overflow-hidden rounded-[18px] border border-border bg-surface">
            <MatchRows matches={rows} rule={rule} canEdit={false} gameDayId={day.id} myName={me?.name ?? null} />
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="grid min-w-0 grid-rows-[32px_auto] items-center justify-items-center">
      <dt className="row-start-2 text-xs text-[#d9f6fb]">{label}</dt>
      <dd className={`row-start-1 font-display font-extrabold leading-none tabular-nums ${small ? "text-[15px]" : "text-2xl"}`}>{value}</dd>
    </div>
  );
}
