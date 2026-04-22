import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { StatTile } from "@/components/ui/stat-tile";
import { MatchFormStrip } from "@/components/match-form-strip";
import { DashboardHero, type HeroState } from "./dashboard-hero";

export const dynamic = "force-dynamic";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const [ranking, plannedDay, stats] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned" },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
    computePlayerSeasonStats(session.user.id, season.id),
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

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Teilnahme"
          value={stats.attendance.total === 0 ? null : `${stats.attendance.attended}/${stats.attendance.total}`}
          hint="Spieltage"
          tone="primary"
        />
        <StatTile
          label="Win-Rate"
          value={
            stats.winRate.matches === 0
              ? null
              : `${Math.round((stats.winRate.wins / stats.winRate.matches) * 100)}%`
          }
          hint={stats.winRate.matches === 0 ? undefined : `${stats.winRate.wins} von ${stats.winRate.matches}`}
          tone="lime"
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Medaillen Saison {season.year}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl" aria-hidden="true">🥇</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.gold}
            </div>
          </div>
          <div>
            <div className="text-2xl" aria-hidden="true">🥈</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.silver}
            </div>
          </div>
          <div>
            <div className="text-2xl" aria-hidden="true">🥉</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.bronze}
            </div>
          </div>
        </div>
      </div>

      {stats.recentForm.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Letzte {stats.recentForm.length} Matches
          </div>
          <div className="mt-2">
            <MatchFormStrip outcomes={stats.recentForm} />
          </div>
        </div>
      )}

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
