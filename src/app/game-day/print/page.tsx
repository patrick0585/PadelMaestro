import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { contextFromSession } from "@/lib/auth/group-context";
import { NoGroupNotice } from "@/components/no-group-notice";
import { prisma } from "@/lib/db";
import { findCurrentGameDayId } from "@/lib/game-day/current";
import { getGroupRules } from "@/lib/group/rules";
import { describeRule, ruleForGameDay } from "@/lib/scoring/rule";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

export default async function GameDayPrintPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/game-day");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;

  const currentId = await findCurrentGameDayId(ctx.groupId);
  const day = currentId
    ? await prisma.gameDay.findUnique({
        where: { id: currentId },
        include: {
          participants: {
            include: { player: { select: { id: true, name: true } } },
          },
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
      })
    : null;

  if (!day) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-foreground-muted">
          Kein aktiver Spieltag zum Drucken.
        </p>
      </div>
    );
  }

  const rules = await getGroupRules(ctx.groupId);
  const dateText = new Date(day.date).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const playing = day.participants
    .filter((p) => p.attendance === "confirmed")
    .map((p) => p.player.name)
    .sort((a, b) => a.localeCompare(b, "de"));
  const joker = day.participants
    .filter((p) => p.attendance === "joker")
    .map((p) => p.player.name)
    .sort((a, b) => a.localeCompare(b, "de"));
  const scoring = describeRule(ruleForGameDay(day));
  const matches = day.matches.map((m) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    team1A: m.team1PlayerA.name,
    team1B: m.team1PlayerB.name,
    team2A: m.team2PlayerA.name,
    team2B: m.team2PlayerB.name,
  }));

  return (
    <PrintSheet
      dateText={dateText}
      scoring={scoring}
      playing={playing}
      joker={joker}
      matches={matches}
      jokerGamesCredited={rules.jokerGamesCredited}
    />
  );
}
