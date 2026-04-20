import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { InviteForm } from "./invite-form";
import { CreateGameDayForm } from "./create-game-day-form";
import { StartGameDayButton } from "./start-game-day-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/ranking");

  const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
  const openInvites = await prisma.invitation.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const plannedDay = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="text-sm">
          <a href="/ranking" className="mr-4">Rangliste</a>
          <a href="/game-day">Spieltag</a>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spieltag</h2>
        <CreateGameDayForm />
        {plannedDay && (
          <div className="flex items-center gap-3">
            <span className="text-sm">
              Offener Spieltag: {new Date(plannedDay.date).toLocaleDateString("de-DE")}
            </span>
            <StartGameDayButton gameDayId={plannedDay.id} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spieler einladen</h2>
        <InviteForm />
        {openInvites.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">Offene Einladungen</h3>
            <ul className="text-sm">
              {openInvites.map((i) => (
                <li key={i.id}>
                  {i.email} — läuft ab am {new Date(i.expiresAt).toLocaleDateString("de-DE")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Spielerliste</h2>
        <ul className="mt-2 text-sm">
          {players.map((p) => (
            <li key={p.id}>
              {p.name} ({p.email}) {p.isAdmin && <span className="text-xs">· Admin</span>}
              {p.deletedAt && <span className="text-xs"> · entfernt</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
