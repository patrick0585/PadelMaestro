import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AttendanceWidget } from "./attendance-widget";
import { MatchList } from "./match-list";

export const dynamic = "force-dynamic";

export default async function GameDayPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const day = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "roster_locked", "in_progress"] } },
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
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
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Kein aktiver Spieltag</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Ein Admin muss zuerst einen Spieltag anlegen.
        </p>
      </main>
    );
  }

  const me = day.participants.find((p) => p.playerId === session.user.id);
  const format = day.playerCount === 4 ? "first-to-6" : "first-to-3";

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Spieltag {new Date(day.date).toLocaleDateString("de-DE")}
        </h1>
        <p className="text-sm text-muted-foreground">Status: {day.status}</p>
      </header>

      {day.status === "planned" && me && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Bist du dabei?</h2>
          <AttendanceWidget gameDayId={day.id} current={me.attendance} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">Teilnehmer</h2>
        <ul className="text-sm">
          {day.participants.map((p) => (
            <li key={p.id}>
              {p.player.name} — {p.attendance}
            </li>
          ))}
        </ul>
      </section>

      {day.matches.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Spiele</h2>
          <MatchList
            format={format}
            matches={day.matches.map((m) => ({
              id: m.id,
              matchNumber: m.matchNumber,
              team1A: m.team1PlayerA.name,
              team1B: m.team1PlayerB.name,
              team2A: m.team2PlayerA.name,
              team2B: m.team2PlayerB.name,
              team1Score: m.team1Score,
              team2Score: m.team2Score,
              version: m.version,
            }))}
          />
        </section>
      )}
    </main>
  );
}
