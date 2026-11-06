import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { buildSeasonTrend } from "@/lib/ranking/season-trend";
import { gapToAbove, movementByPlayer } from "@/lib/ranking/standing";
import { gapToLeaderByDay, trendLeaderId } from "@/lib/ranking/trend-view";
import { recentFormByPlayer } from "@/lib/home/recent-form";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { SeasonTrendChart } from "@/components/season-trend-chart";
import { NoGroupNotice } from "@/components/no-group-notice";
import { Standings, type StandingRow } from "@/components/ranking/standings";
import { GapToLeader } from "@/components/ranking/gap-to-leader";
import { parseRankingView, RankingTabs } from "@/components/ranking/ranking-tabs";
import { DuoOverview } from "@/components/duos/duo-overview";
import { LABEL } from "@/components/home/styles";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const EMPTY = "rounded-[18px] border border-dashed border-border p-4 text-sm text-foreground-muted";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string | string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;
  const meId = session.user.id;
  const view = parseRankingView((await searchParams).ansicht);

  const season = await getOrCreateActiveSeason(ctx.groupId);
  const [trend, liveDays, ranking] = await Promise.all([
    buildSeasonTrend(season.id),
    prisma.gameDay.count({ where: { seasonId: season.id, status: "in_progress" } }),
    view === "tabelle" ? computeRanking(season.id) : null,
  ]);
  const days = trend.days.length;
  const live = liveDays > 0;

  return (
    <div className="space-y-3.5">
      <header>
        <p className={`${LABEL} text-primary`}>
          {season.name}
          {days > 0 && ` · ${days} ${days === 1 ? "Spieltag" : "Spieltage"}`}
        </p>
        <h1 className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none">Rangliste</h1>
      </header>
      <RankingTabs active={view} />

      {ranking && <TableView seasonId={season.id} ranking={ranking} meId={meId} trend={trend} live={live} />}
      {view === "verlauf" && <TrendView trend={trend} meId={meId} live={live} />}
      {view === "duos" && <DuosView seasonId={season.id} meId={meId} />}
    </div>
  );
}

type Trend = Awaited<ReturnType<typeof buildSeasonTrend>>;

async function TableView({
  seasonId,
  ranking,
  meId,
  trend,
  live,
}: {
  seasonId: string;
  ranking: Awaited<ReturnType<typeof computeRanking>>;
  meId: string;
  trend: Trend;
  live: boolean;
}) {
  if (ranking.length === 0) return <p className={EMPTY}>Noch keine Spieler mit Matches in dieser Saison.</p>;
  const form = await recentFormByPlayer(
    seasonId,
    ranking.map((r) => r.playerId),
  );
  // While a day is running, ranks already include its scores but the trend only
  // knows finished days, so arrows could contradict the shown rank.
  const movement = live ? new Map<string, number | null>() : movementByPlayer(trend.players);

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
  return <Standings rows={rows} myGap={gapToAbove(ranking, meId)} />;
}

function TrendView({ trend, meId, live }: { trend: Trend; meId: string; live: boolean }) {
  const liveNote = live && (
    <p className="px-1 text-[12px] text-foreground-muted">Der laufende Spieltag erscheint hier nach dem Abschluss.</p>
  );
  if (trend.days.length < 2) {
    return (
      <>
        <p className={EMPTY}>Der Verlauf startet nach dem zweiten abgeschlossenen Spieltag.</p>
        {liveNote}
      </>
    );
  }
  return (
    <>
      <SeasonTrendChart
        data={{
          days: trend.days.map((d) => ({ date: d.date.toISOString() })),
          players: trend.players,
          totalPlayers: trend.totalPlayers,
        }}
        currentPlayerId={meId}
        leaderId={trendLeaderId(trend.players)}
      />
      <GapToLeader gaps={gapToLeaderByDay(trend.players, meId)} />
      {liveNote}
    </>
  );
}

async function DuosView({ seasonId, meId }: { seasonId: string; meId: string }) {
  const stats = await computePlayerSeasonStats(meId, seasonId);
  return (
    <>
      <p className="px-1 text-[13px] text-foreground-muted">
        Deine Partner · {stats.partners.length} Partner · {stats.winRate.matches}{" "}
        {stats.winRate.matches === 1 ? "Match" : "Matches"}
      </p>
      <DuoOverview
        partners={stats.partners}
        bestId={stats.bestPartner?.playerId ?? null}
        worstId={stats.worstPartner?.playerId ?? null}
      />
    </>
  );
}
