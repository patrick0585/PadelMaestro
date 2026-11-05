import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { buildSeasonTrend } from "@/lib/ranking/season-trend";
import { gapToAbove, movementByPlayer } from "@/lib/ranking/standing";
import { recentFormByPlayer } from "@/lib/home/recent-form";
import { SeasonTrendChart } from "@/components/season-trend-chart";
import { NoGroupNotice } from "@/components/no-group-notice";
import { Standings, type StandingRow } from "@/components/ranking/standings";
import { LABEL } from "@/components/home/styles";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;
  const meId = session.user.id;

  const season = await getOrCreateActiveSeason(ctx.groupId);
  const [ranking, trend, liveDays] = await Promise.all([
    computeRanking(season.id),
    buildSeasonTrend(season.id),
    prisma.gameDay.count({ where: { seasonId: season.id, status: "in_progress" } }),
  ]);
  const form = await recentFormByPlayer(
    season.id,
    ranking.map((r) => r.playerId),
  );
  // While a day is running, ranks already include its scores but the trend only
  // knows finished days, so arrows could contradict the shown rank.
  const movement = liveDays > 0 ? new Map<string, number | null>() : movementByPlayer(trend.players);

  const rows: StandingRow[] = ranking.map((r) => ({
    playerId: r.playerId,
    name: r.playerName,
    avatarVersion: r.avatarVersion,
    rank: r.rank,
    points: r.points,
    ppg: r.pointsPerGame,
    games: r.games,
    jokersUsed: r.jokersUsed,
    medals: r.medals,
    movement: movement.get(r.playerId) ?? null,
    form: form.get(r.playerId) ?? [],
    isMe: r.playerId === meId,
  }));
  const days = trend.days.length;

  return (
    <div className="space-y-3.5">
      <header>
        <p className={`${LABEL} text-primary`}>
          {season.name}
          {days > 0 && ` · ${days} ${days === 1 ? "Spieltag" : "Spieltage"}`}
        </p>
        <h1 className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none">Rangliste</h1>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-border p-4 text-sm text-foreground-muted">
          Noch keine Spieler mit Matches in dieser Saison.
        </p>
      ) : (
        <Standings rows={rows} myGap={gapToAbove(ranking, meId)} />
      )}

      <section aria-labelledby="season-trend" className="rounded-[18px] border border-border bg-surface px-3.5 py-3">
        <div className={`mb-2 flex justify-between ${LABEL}`}>
          <h2 id="season-trend">Saisonverlauf · Platz</h2>
          <span aria-hidden="true">Du hervorgehoben</span>
        </div>
        <SeasonTrendChart
          data={{
            days: trend.days.map((d) => ({ date: d.date.toISOString() })),
            players: trend.players,
            totalPlayers: trend.totalPlayers,
          }}
          currentPlayerId={meId}
        />
      </section>
    </div>
  );
}
