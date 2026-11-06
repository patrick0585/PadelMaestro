import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { needsName } from "@/lib/account/apple";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeStandings } from "@/lib/ranking/compute";
import { computeHomeSeasonStats } from "@/lib/player/season-stats";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { loadEmailNotice } from "@/components/email-notice";
import { NoGroupNotice } from "@/components/no-group-notice";
import { HomeView, type HomeSeason, type HomeViewProps } from "@/components/home/home-view";
import type { LeagueRow } from "@/components/home/league-table";
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
  const [group, ranking, liveDay, plannedDay, stats, rules, emailNotice] = await Promise.all([
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
    loadEmailNotice(meId),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";
  const myRow = ranking.find((r) => r.playerId === meId);
  const hasPlayed = stats.winRate.matches > 0 && myRow !== undefined;

  const tableSource = pickTableRows(ranking, meId);
  const formPromise = recentFormByPlayer(
    season.id,
    tableSource.map((r) => r.playerId),
  );

  let live: HomeViewProps["live"] = null;
  let hero: HomeViewProps["hero"] = null;
  let recap: HomeViewProps["recap"] = null;
  if (liveDay) {
    const ids = [
      ...new Set(
        liveDay.matches.flatMap((m) => [m.team1PlayerAId, m.team1PlayerBId, m.team2PlayerAId, m.team2PlayerBId]),
      ),
    ];
    const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameById = Object.fromEntries(players.map((p) => [p.id, p.name.split(" ")[0]]));
    live = deriveLiveTicket(
      liveDay.matches.map((m) => ({
        matchNumber: m.matchNumber,
        team1: [m.team1PlayerAId, m.team1PlayerBId],
        team2: [m.team2PlayerAId, m.team2PlayerBId],
        team1Score: m.team1Score,
        team2Score: m.team2Score,
      })),
      nameById,
    );
  }
  if (plannedDay) {
    hero = buildHeroState(plannedDay, meId, {
      jokersRemaining: stats.jokers.remaining,
      jokersTotal: stats.jokers.total,
      jokerGamesCredited: rules.jokerGamesCredited,
      ppgSnapshot: hasPlayed ? myRow.pointsPerGame : null,
      now: new Date(),
    });
  }
  if (!liveDay && !plannedDay) {
    const lastDay = await prisma.gameDay.findFirst({
      where: { ...dayScope, status: "finished" },
      orderBy: { date: "desc" },
      select: { id: true },
    });
    const summary = lastDay ? await computeGameDaySummary(lastDay.id) : null;
    recap = {
      dateLabel: summary ? dateShortOf(summary.date) : null,
      podium: (summary?.podium ?? []).map((r) => ({
        playerId: r.playerId,
        name: r.playerName.split(" ")[0],
        rank: r.rank,
        ppg: r.matches > 0 ? r.points / r.matches : 0,
      })),
    };
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

  const seasonCard: HomeSeason = hasPlayed
    ? {
        kind: "played",
        card: {
          seasonName: season.name,
          groupName: group?.name ?? "",
          ppg: myRow.pointsPerGame,
          wins: stats.winRate.wins,
          matches: stats.winRate.matches,
          attended: stats.attendance.attended,
          totalDays: stats.attendance.total,
          jokersUsed: stats.jokers.used,
          jokersTotal: stats.jokers.total,
          form: [...stats.recentPpg].reverse(),
        },
      }
    : { kind: "empty", seasonName: season.name, jokersRemaining: stats.jokers.remaining };

  return (
    <HomeView
      firstName={firstName}
      emailNotice={emailNotice}
      live={live}
      hero={hero}
      recap={recap}
      season={seasonCard}
      table={{ rows: tableRows, myGap: myGap ? gapText(myGap) : null }}
    />
  );
}
