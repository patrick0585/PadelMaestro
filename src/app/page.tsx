import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { StatTile } from "@/components/ui/stat-tile";
import { DashboardHero, type HeroState } from "./dashboard-hero";

export const dynamic = "force-dynamic";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const [ranking, plannedDay] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned" },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";

  let heroState: HeroState | null = null;
  if (plannedDay) {
    const confirmed = plannedDay.participants.filter((p) => p.attendance === "confirmed").length;
    const total = plannedDay.participants.length;
    const date = plannedDay.date.toISOString();
    const time = formatTime(plannedDay.date.toISOString());
    const me = plannedDay.participants.find((p) => p.playerId === session.user.id);
    if (!me) {
      heroState = { kind: "not-member", gameDayId: plannedDay.id, date, time, confirmed, total };
    } else {
      const attendance =
        me.attendance === "confirmed" || me.attendance === "declined" ? me.attendance : "pending";
      heroState = {
        kind: "member",
        gameDayId: plannedDay.id,
        date,
        time,
        confirmed,
        total,
        attendance,
      };
    }
  }

  const myRow = ranking.find((r) => r.playerId === session.user.id);
  const myPpg = myRow ? myRow.pointsPerGame.toFixed(2) : null;
  const myRank = myRow ? `#${myRow.rank}` : null;

  const top3 = ranking.slice(0, 3);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Hi{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Dein Padel</h1>
      </header>

      {heroState && <DashboardHero state={heroState} />}

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Dein PPG" value={myPpg} tone="primary" />
        <StatTile label="Rang" value={myRank} tone="lime" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Top 3
          </span>
          <Link href="/ranking" className="text-xs font-semibold text-primary">
            ansehen →
          </Link>
        </div>
        <ul className="mt-2 space-y-1">
          {top3.length === 0 && (
            <li className="py-2 text-sm text-foreground-dim">Noch keine Spieler mit Matches.</li>
          )}
          {top3.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 py-1 text-sm">
              <span className="w-5 text-right font-extrabold text-primary">{r.rank}</span>
              <span className="flex-1 font-semibold text-foreground">{r.playerName}</span>
              <span className="font-semibold tabular-nums text-foreground-muted">
                {r.pointsPerGame.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
