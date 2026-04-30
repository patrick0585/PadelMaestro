import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { MatchInlineCard } from "./match-inline-card";
import { Timeline } from "@/components/ui/timeline";
import { timelineForStatus, shouldSubscribeToLiveUpdates, type GameDayStatus } from "./phase";
import { PlannedSection } from "./planned-section";
import { RosterChips, type RosterAttendance } from "./roster-chips";
import { AddExtraMatchButton } from "./add-extra-match-button";
import { FinishBanner } from "./finish-banner";
import { FinishedSummary } from "./finished-summary";
import { DayLiveBanner } from "./day-live-banner";
import { computeDayLiveStandings } from "@/lib/game-day/live-standings";
import { GameDayLiveUpdates } from "./live-updates";

export const dynamic = "force-dynamic";

function normalizeAttendance(value: string): RosterAttendance {
  return value === "confirmed" || value === "declined" || value === "joker"
    ? value
    : "pending";
}

export default async function GameDayPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const dayInclude = {
    participants: { include: { player: { select: { id: true, name: true } } } },
    matches: {
      orderBy: { matchNumber: "asc" as const },
      include: {
        team1PlayerA: { select: { name: true } },
        team1PlayerB: { select: { name: true } },
        team2PlayerA: { select: { name: true } },
        team2PlayerB: { select: { name: true } },
        scoredBy: { select: { name: true } },
      },
    },
  };

  const activeDay = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "roster_locked", "in_progress"] } },
    orderBy: { date: "desc" },
    include: dayInclude,
  });

  const recentFinishedDay = activeDay
    ? null
    : await prisma.gameDay.findFirst({
        where: {
          status: "finished",
          date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: "desc" },
        include: dayInclude,
      });

  const day = activeDay ?? recentFinishedDay;

  if (!day) {
    return (
      <Card>
        <CardBody>
          <h1 className="text-lg font-semibold text-foreground">Kein aktiver Spieltag</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ein Admin muss zuerst einen Spieltag anlegen.
          </p>
        </CardBody>
      </Card>
    );
  }

  const me = day.participants.find((p) => p.playerId === session.user.id);
  const steps = timelineForStatus(day.status as GameDayStatus);
  const dateText = new Date(day.date).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
  const showFinishBanner =
    session.user.isAdmin &&
    day.status === "in_progress" &&
    day.matches.length > 0 &&
    day.matches.every((m) => m.team1Score !== null && m.team2Score !== null);

  const participants = day.participants.map((p) => ({
    playerId: p.playerId,
    name: p.player.name,
    attendance: normalizeAttendance(p.attendance),
  }));

  const liveStandings =
    day.status === "in_progress" ? await computeDayLiveStandings(day.id) : null;

  return (
    <div className="space-y-4">
      {shouldSubscribeToLiveUpdates(day.status as GameDayStatus) && (
        <GameDayLiveUpdates gameDayId={day.id} />
      )}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Spieltag</p>
          <h1 className="text-2xl font-bold text-foreground">{dateText}</h1>
        </div>
        {session.user.isAdmin &&
          (day.status === "roster_locked" || day.status === "in_progress") && (
            <Link
              href="/game-day/print"
              className="shrink-0 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground-muted hover:text-foreground"
            >
              🖨 Drucken
            </Link>
          )}
      </header>
      <Timeline steps={steps} />

      {liveStandings && (
        <DayLiveBanner
          rows={liveStandings.rows}
          scoredMatchCount={liveStandings.scoredMatchCount}
          totalMatchCount={liveStandings.totalMatchCount}
          hasPreviousState={liveStandings.hasPreviousState}
        />
      )}

      {day.status === "planned" && (
        <PlannedSection
          gameDayId={day.id}
          me={
            me
              ? {
                  playerId: me.playerId,
                  name: me.player.name,
                  attendance: normalizeAttendance(me.attendance),
                }
              : null
          }
          participants={participants}
        />
      )}

      {(day.status === "roster_locked" || day.status === "in_progress") && (
        <RosterChips participants={participants} />
      )}

      {day.matches.length > 0 && (day.status === "roster_locked" || day.status === "in_progress" || day.status === "finished") && (
        <section className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Matches
          </h2>
          <div className="space-y-2">
            {day.matches.map((m) => (
              <MatchInlineCard
                key={m.id}
                maxScore={day.playerCount === 4 ? 12 : 3}
                match={{
                  id: m.id,
                  matchNumber: m.matchNumber,
                  team1A: m.team1PlayerA.name,
                  team1B: m.team1PlayerB.name,
                  team2A: m.team2PlayerA.name,
                  team2B: m.team2PlayerB.name,
                  team1Score: m.team1Score,
                  team2Score: m.team2Score,
                  version: m.version,
                  scoredByName: m.scoredBy?.name ?? null,
                  scoredAt: m.scoredAt?.toISOString() ?? null,
                }}
              />
            ))}
          </div>
          {(day.status === "roster_locked" || day.status === "in_progress") &&
            (session.user.isAdmin ||
              me?.attendance === "confirmed" ||
              me?.attendance === "joker") && (
              <AddExtraMatchButton gameDayId={day.id} />
            )}
        </section>
      )}

      {showFinishBanner && <FinishBanner gameDayId={day.id} />}

      {day.status === "finished" && (
        <FinishedSummary
          gameDayId={day.id}
          scoredMatchCount={day.matches.filter((m) => m.team1Score !== null && m.team2Score !== null).length}
          totalMatchCount={day.matches.length}
        />
      )}
    </div>
  );
}
