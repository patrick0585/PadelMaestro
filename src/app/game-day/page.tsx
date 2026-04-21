import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendanceWidget } from "./attendance-widget";
import { MatchList } from "./match-list";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  roster_locked: "Paarungen festgelegt",
  in_progress: "Läuft",
  finished: "Beendet",
};

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
  const format = day.playerCount === 4 ? "first-to-6" : "first-to-3";

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Spieltag
            </p>
            <h1 className="text-xl font-bold text-foreground">
              {new Date(day.date).toLocaleDateString("de-DE")}
            </h1>
          </div>
          <Badge>{STATUS_LABEL[day.status] ?? day.status}</Badge>
        </CardBody>
      </Card>

      {day.status === "planned" && me && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-base font-semibold text-foreground">Bist du dabei?</h2>
            <AttendanceWidget
              gameDayId={day.id}
              current={
                me.attendance === "confirmed" || me.attendance === "declined"
                  ? me.attendance
                  : "unknown"
              }
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-base font-semibold text-foreground">Teilnehmer</h2>
          <ul className="space-y-1 text-sm">
            {day.participants.map((p) => (
              <li key={p.id} className="flex justify-between text-foreground">
                <span>{p.player.name}</span>
                <span className="text-muted-foreground">{p.attendance}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {day.matches.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">Spiele</h2>
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
        </div>
      )}
    </div>
  );
}
