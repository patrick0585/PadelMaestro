import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateGameDayForm } from "./create-game-day-form";
import { StartGameDayButton } from "./start-game-day-button";
import { DeleteGameDayButton } from "./delete-game-day-button";
import { PlayersSection } from "./players-section";
import {
  ParticipantsRoster,
  type ParticipantAttendance,
  type RosterRow,
} from "./participants-roster";
import { MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";
import { getOrCreateActiveSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

type ParticipantWithPlayer = {
  playerId: string;
  attendance: ParticipantAttendance;
  player: { id: string; name: string };
};

function buildRosterRows(
  participants: ParticipantWithPlayer[],
  activePlayers: { id: string; name: string }[],
  jokersRemainingByPlayer: Map<string, number>,
): RosterRow[] {
  const byId = new Map(participants.map((p) => [p.playerId, p]));
  return activePlayers
    .map((player) => {
      const participant = byId.get(player.id);
      const attendance: ParticipantAttendance =
        participant?.attendance === "confirmed" ||
        participant?.attendance === "declined" ||
        participant?.attendance === "joker"
          ? participant.attendance
          : "pending";
      return {
        playerId: player.id,
        name: player.name,
        attendance,
        jokersRemaining: jokersRemainingByPlayer.get(player.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/ranking");

  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      isAdmin: true,
      passwordHash: true,
      avatarVersion: true,
    },
  });
  const manageableDay = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
    include: {
      participants: {
        include: { player: { select: { id: true, name: true } } },
        orderBy: { player: { name: "asc" } },
      },
    },
  });

  const season = await getOrCreateActiveSeason();
  const jokerCounts = await prisma.jokerUse.groupBy({
    by: ["playerId"],
    where: { seasonId: season.id },
    _count: { _all: true },
  });
  const jokerCountById = new Map(jokerCounts.map((j) => [j.playerId, j._count._all]));
  const jokersRemaining = new Map<string, number>(
    players.map((p) => [p.id, Math.max(0, MAX_JOKERS_PER_SEASON - (jokerCountById.get(p.id) ?? 0))]),
  );

  const playersForUi = players.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    username: p.username,
    isAdmin: p.isAdmin,
    hasPassword: p.passwordHash !== null,
    avatarVersion: p.avatarVersion,
  }));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</p>
        <h1 className="text-2xl font-bold text-foreground">Verwaltung</h1>
      </header>

      <PlayersSection players={playersForUi} />

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Spieltage</h2>
          <CreateGameDayForm />
          {manageableDay && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium text-foreground">
                    {manageableDay.status === "planned" ? "Offener Spieltag" : "Spieltag läuft"}
                    : {new Date(manageableDay.date).toLocaleDateString("de-DE")}
                  </div>
                  <Badge variant="neutral">
                    {manageableDay.status === "planned" ? "Geplant" : "Aufstellung steht"}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {manageableDay.status === "planned" && (
                    <StartGameDayButton gameDayId={manageableDay.id} />
                  )}
                  <DeleteGameDayButton
                    gameDayId={manageableDay.id}
                    dateLabel={new Date(manageableDay.date).toLocaleDateString("de-DE")}
                  />
                </div>
              </div>
              {manageableDay.status === "planned" && (
                <ParticipantsRoster
                  gameDayId={manageableDay.id}
                  participants={buildRosterRows(manageableDay.participants, players, jokersRemaining)}
                />
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-base font-semibold text-foreground">Historische Daten</h2>
          <p className="break-words text-sm text-muted-foreground">
            Import über die CLI:
            <code className="mx-1 rounded-md bg-surface-muted px-1.5 py-0.5">
              pnpm import:historical &lt;file&gt;
            </code>
            — Details in <code className="rounded-md bg-surface-muted px-1.5 py-0.5">docs/import-historical.md</code>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
