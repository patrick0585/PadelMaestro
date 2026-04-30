import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

export default async function GameDayPrintPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/game-day");

  const day = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "in_progress"] } },
    orderBy: { date: "desc" },
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
  });

  if (!day) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-foreground-muted">
          Kein aktiver Spieltag zum Drucken.
        </p>
      </div>
    );
  }

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
  const maxScore = day.playerCount === 4 ? 12 : 3;
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
      status={day.status}
      maxScore={maxScore}
      playing={playing}
      joker={joker}
      matches={matches}
    />
  );
}
