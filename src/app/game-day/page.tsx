import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { MatchInlineCard } from "./match-inline-card";
import { Timeline } from "@/components/ui/timeline";
import { timelineForStatus, type GameDayStatus } from "./phase";
import { PlannedSection } from "./planned-section";
import { AddExtraMatchButton } from "./add-extra-match-button";
import { FinishBanner } from "./finish-banner";
import { FinishedSummary } from "./finished-summary";

export const dynamic = "force-dynamic";

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

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Spieltag</p>
        <h1 className="text-2xl font-bold text-foreground">{dateText}</h1>
      </header>
      <Timeline steps={steps} />

      {day.status === "planned" && (
        <PlannedSection
          gameDayId={day.id}
          me={me ? { playerId: me.playerId, name: me.player.name, attendance: (me.attendance === "confirmed" || me.attendance === "declined") ? me.attendance : "pending" } : null}
          participants={day.participants.map((p) => ({
            playerId: p.playerId,
            name: p.player.name,
            attendance: (p.attendance === "confirmed" || p.attendance === "declined") ? p.attendance : "pending",
          }))}
        />
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
                }}
              />
            ))}
          </div>
          {session.user.isAdmin &&
            (day.status === "roster_locked" || day.status === "in_progress") && (
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
