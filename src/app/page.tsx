import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { Avatar } from "@/components/ui/avatar";
import { StatTile } from "@/components/ui/stat-tile";
import { DashboardHero, type HeroState } from "./dashboard-hero";
import { DayPpgStrip } from "@/components/day-ppg-strip";

export const dynamic = "force-dynamic";

function ppgFromStats(
  stats: { winRate: { matches: number } },
  myRow: { pointsPerGame: number } | undefined,
): number | null {
  if (!myRow || stats.winRate.matches === 0) return null;
  return myRow.pointsPerGame;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const me = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  const meAvatarVersion = me?.avatarVersion ?? 0;

  const season = await getOrCreateActiveSeason();
  const [ranking, plannedDay, stats] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned", seasonId: season.id },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
    computePlayerSeasonStats(session.user.id, season.id),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";

  const myRow = ranking.find((r) => r.playerId === session.user.id);

  let heroState: HeroState | null = null;
  if (plannedDay) {
    const confirmed = plannedDay.participants.filter((p) => p.attendance === "confirmed").length;
    const total = plannedDay.participants.length;
    const date = plannedDay.date.toISOString();
    const meParticipant = plannedDay.participants.find((p) => p.playerId === session.user.id);
    if (!meParticipant) {
      heroState = { kind: "not-member", gameDayId: plannedDay.id, date, confirmed, total };
    } else {
      const attendance =
        meParticipant.attendance === "confirmed" ||
        meParticipant.attendance === "declined" ||
        meParticipant.attendance === "joker"
          ? meParticipant.attendance
          : "pending";
      heroState = {
        kind: "member",
        gameDayId: plannedDay.id,
        date,
        confirmed,
        total,
        attendance,
        jokersRemaining: stats.jokers.remaining,
        ppgSnapshot: ppgFromStats(stats, myRow),
      };
    }
  }

  const myPpg = myRow ? myRow.pointsPerGame.toFixed(2) : null;
  const myRank = myRow ? `#${myRow.rank}` : null;

  const top3 = ranking.slice(0, 3);

  const subtitleParts: string[] = [];
  if (myRow) subtitleParts.push(`Platz ${myRow.rank}`);
  if (stats.attendance.attended > 0) {
    subtitleParts.push(
      `${stats.attendance.attended} ${stats.attendance.attended === 1 ? "Spieltag" : "Spieltage"}`,
    );
  }
  if (stats.jokers.remaining > 0) {
    subtitleParts.push(`${stats.jokers.remaining} Joker`);
  }
  const subtitle =
    subtitleParts.length > 0 ? subtitleParts.join(" · ") : `Saison ${season.year}`;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Avatar
          playerId={session.user.id}
          name={session.user.name ?? ""}
          avatarVersion={meAvatarVersion}
          size={48}
        />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Hi{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>
        </div>
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

      {stats.recentDays.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Letzte {stats.recentDays.length}{" "}
            {stats.recentDays.length === 1 ? "Spieltag" : "Spieltage"}
          </div>
          <div className="mt-2">
            <DayPpgStrip days={stats.recentDays} />
          </div>
        </div>
      )}

      {stats.bestPartner && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Teamwork
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-success/30 bg-success-soft/40 p-3">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-success">
                Beste Chemie
              </div>
              <div className="mt-1 flex items-center gap-2 font-bold text-foreground">
                <Avatar playerId={stats.bestPartner.playerId} name={stats.bestPartner.name} avatarVersion={stats.bestPartner.avatarVersion} size={32} />
                {stats.bestPartner.name}
              </div>
              <div className="mt-0.5 text-xs text-foreground-muted">
                {stats.bestPartner.pointsTogether} Pt · {stats.bestPartner.matches}{" "}
                {stats.bestPartner.matches === 1 ? "Match" : "Matches"}
              </div>
            </div>
            {stats.worstPartner ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive-soft/40 p-3">
                <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-destructive">
                  Weniger Glück
                </div>
                <div className="mt-1 flex items-center gap-2 font-bold text-foreground">
                  <Avatar playerId={stats.worstPartner.playerId} name={stats.worstPartner.name} avatarVersion={stats.worstPartner.avatarVersion} size={32} />
                  {stats.worstPartner.name}
                </div>
                <div className="mt-0.5 text-xs text-foreground-muted">
                  {stats.worstPartner.pointsTogether} Pt · {stats.worstPartner.matches}{" "}
                  {stats.worstPartner.matches === 1 ? "Match" : "Matches"}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs text-foreground-muted">
                Noch zu wenig Partner-Daten für einen Vergleich.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Joker Saison {season.year}
          </span>
          <span className="text-[0.7rem] font-semibold text-foreground-muted">
            {stats.jokers.used} / {stats.jokers.total} eingesetzt
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {Array.from({ length: stats.jokers.total }, (_, i) => {
            const used = i < stats.jokers.used;
            return (
              <span
                key={i}
                aria-label={used ? "Joker eingesetzt" : "Joker verfügbar"}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${
                  used
                    ? "border border-border bg-surface-muted text-foreground-muted"
                    : "bg-primary-soft text-primary-strong"
                }`}
              >
                ★
              </span>
            );
          })}
          <span className="ml-2 text-sm font-semibold text-foreground">
            {stats.jokers.remaining === 0
              ? "Keine Joker mehr verfügbar"
              : stats.jokers.remaining === 1
                ? "1 Joker verfügbar"
                : `${stats.jokers.remaining} Joker verfügbar`}
          </span>
        </div>
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
              <Avatar playerId={r.playerId} name={r.playerName} avatarVersion={r.avatarVersion} size={32} />
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
