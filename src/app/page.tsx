import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { needsName } from "@/lib/account/apple";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeStandings } from "@/lib/ranking/compute";
import { computeHomeSeasonStats } from "@/lib/player/season-stats";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { DashboardHero } from "./dashboard-hero";
import { EmailNotice } from "@/components/email-notice";
import { NoGroupNotice } from "@/components/no-group-notice";
import { LiveTicket } from "@/components/home/live-ticket";
import { RecapTicket } from "@/components/home/recap-ticket";
import { SeasonCard, SeasonCardEmpty } from "@/components/home/season-card";
import { LeagueTable, type LeagueRow } from "@/components/home/league-table";
import { canFoundGroup } from "@/lib/group/create";
import { getGroupRules } from "@/lib/group/rules";
import { buildHeroState, dateShortOf } from "@/lib/home/hero-state";
import { deriveLiveTicket } from "@/lib/home/live-ticket";
import { recentFormByPlayer } from "@/lib/home/recent-form";
import { pickTableRows } from "@/lib/home/table-rows";
import { gapText, gapToAbove } from "@/lib/ranking/standing";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (await needsName(session.user.id)) redirect("/willkommen/name");
  const ctx = contextFromSession(session);
  if (!ctx) {
    const canFound = await canFoundGroup(session.user.id);
    return <NoGroupNotice canFound={canFound} />;
  }
  const meId = session.user.id;

  const season = await getOrCreateActiveSeason(ctx.groupId);
  const dayScope = { seasonId: season.id, groupId: ctx.groupId };
  const [group, ranking, liveDay, plannedDay, stats, rules] = await Promise.all([
    prisma.group.findUnique({ where: { id: ctx.groupId }, select: { name: true } }),
    computeStandings(season.id),
    prisma.gameDay.findFirst({
      where: { ...dayScope, status: "in_progress" },
      orderBy: { date: "asc" },
      select: {
        matches: {
          select: {
            matchNumber: true,
            team1PlayerAId: true,
            team1PlayerBId: true,
            team2PlayerAId: true,
            team2PlayerBId: true,
            team1Score: true,
            team2Score: true,
          },
        },
      },
    }),
    prisma.gameDay.findFirst({
      where: { ...dayScope, status: "planned" },
      orderBy: { date: "asc" },
      include: {
        participants: {
          select: {
            playerId: true,
            attendance: true,
            player: { select: { name: true, avatarVersion: true } },
          },
        },
      },
    }),
    computeHomeSeasonStats(meId, season.id),
    getGroupRules(ctx.groupId),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";
  const myRow = ranking.find((r) => r.playerId === meId);
  const hasPlayed = stats.winRate.matches > 0 && myRow !== undefined;

  const tableSource = pickTableRows(ranking, meId);
  const formPromise = recentFormByPlayer(
    season.id,
    tableSource.map((r) => r.playerId),
  );

  let liveTicket: React.ReactNode = null;
  let plannedTicket: React.ReactNode = null;
  let recapTicket: React.ReactNode = null;
  if (liveDay) {
    const ids = [
      ...new Set(
        liveDay.matches.flatMap((m) => [m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId]),
      ),
    ];
    const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameById = Object.fromEntries(players.map((p) => [p.id, p.name.split(" ")[0]]));
    const data = deriveLiveTicket(
      liveDay.matches.map((m) => ({
        matchNumber: m.matchNumber,
        team1: [m.team1PlayerAId, m.team1PlayerBId],
        team2: [m.team2PlayerAId, m.team2PlayerBId],
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      })),
      nameById,
    );
    liveTicket = <LiveTicket data={data} />;
  }
  if (plannedDay) {
    const heroState = buildHeroState(plannedDay, meId, {
      jokersRemaining: stats.jokers.remaining,
      jokersTotal: stats.jokers.total,
      jokerGamesCredited: rules.jokerGamesCredited,
      ppgSnapshot: hasPlayed ? myRow.pointsPerGame : null,
      now: new Date(),
    });
    plannedTicket = <DashboardHero state={heroState} />;
  }
  if (!liveDay && !plannedDay) {
    const lastDay = await prisma.gameDay.findFirst({
      where: { ...dayScope, status: "finished" },
      orderBy: { date: "desc" },
      select: { id: true },
    });
    const summary = lastDay ? await computeGameDaySummary(lastDay.id) : null;
    recapTicket = (
      <RecapTicket
        dateLabel={summary ? dateShortOf(summary.date) : null}
        podium={(summary?.podium ?? []).map((r) => ({
          playerId: r.playerId,
          name: r.playerName.split(" ")[0],
          rank: r.rank,
          ppg: r.matches > 0 ? r.points / r.matches : 0,
        }))}
      />
    );
  }

  const form = await formPromise;
  const myGap = gapToAbove(ranking, meId);
  const tableRows: LeagueRow[] = tableSource.map((r) => ({
    playerId: r.playerId,
    name: r.playerName,
    avatarVersion: r.avatarVersion,
    rank: r.rank,
    points: r.points,
    ppg: r.pointsPerGame,
    form: form.get(r.playerId) ?? [],
    isMe: r.playerId === meId,
  }));

  return (
    <div className="space-y-3.5">
      <header>
        <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          Hi{firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      <EmailNotice playerId={meId} compact />

      {liveTicket}
      {plannedTicket}
      {recapTicket}

      {hasPlayed ? (
        <SeasonCard
          seasonName={season.name}
          groupName={group?.name ?? ""}
          ppg={myRow.pointsPerGame}
          wins={stats.winRate.wins}
          matches={stats.winRate.matches}
          attended={stats.attendance.attended}
          totalDays={stats.attendance.total}
          jokersUsed={stats.jokers.used}
          jokersTotal={stats.jokers.total}
          form={[...stats.recentPpg].reverse()}
          muted={recapTicket !== null}
        />
      ) : (
        <SeasonCardEmpty seasonName={season.name} jokersRemaining={stats.jokers.remaining} />
      )}

      {tableRows.length > 0 && <LeagueTable rows={tableRows} myGap={myGap ? gapText(myGap) : null} />}
    </div>
  );
}
