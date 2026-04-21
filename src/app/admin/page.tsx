import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateGameDayForm } from "./create-game-day-form";
import { StartGameDayButton } from "./start-game-day-button";
import { PlayersSection } from "./players-section";
import { ParticipantsSection, type ParticipantAttendance } from "./participants-section";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/ranking");

  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, isAdmin: true, passwordHash: true },
  });
  const plannedDay = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
    include: {
      participants: {
        include: { player: { select: { id: true, name: true } } },
        orderBy: { player: { name: "asc" } },
      },
    },
  });

  const playersForUi = players.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    isAdmin: p.isAdmin,
    hasPassword: p.passwordHash !== null,
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
          {plannedDay && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-medium text-foreground">
                    Offener Spieltag: {new Date(plannedDay.date).toLocaleDateString("de-DE")}
                  </div>
                  <Badge variant="neutral">planned</Badge>
                </div>
                <StartGameDayButton gameDayId={plannedDay.id} />
              </div>
              <ParticipantsSection
                gameDayId={plannedDay.id}
                participants={plannedDay.participants.map((p) => ({
                  playerId: p.playerId,
                  name: p.player.name,
                  attendance:
                    p.attendance === "confirmed" || p.attendance === "declined"
                      ? p.attendance
                      : ("pending" as ParticipantAttendance),
                }))}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-base font-semibold text-foreground">Historische Daten</h2>
          <p className="text-sm text-muted-foreground">
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
