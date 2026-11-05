import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { Avatar } from "@/components/ui/avatar";
import { DashboardHero, type HeroState } from "./dashboard-hero";
import { EmailNotice } from "@/components/email-notice";
import { NoGroupNotice } from "@/components/no-group-notice";
import { LiveTicket } from "@/components/home/live-ticket";
import { RecapTicket } from "@/components/home/recap-ticket";
import { SeasonCard, SeasonCardEmpty } from "@/components/home/season-card";
import { LeagueTable, type LeagueRow } from "@/components/home/league-table";
import { TrophyShelf } from "@/components/home/trophy-shelf";
import { DuoCards } from "@/components/home/duo-cards";
import { canFoundGroup } from "@/lib/group/create";
import { getGroupRules } from "@/lib/group/rules";
import { countdownLabel, daysUntil } from "@/lib/home/countdown";
import { deriveLiveTicket } from "@/lib/home/live-ticket";
import { recentFormByPlayer } from "@/lib/home/recent-form";
import { pickTableRows } from "@/lib/home/table-rows";

export const dynamic = "force-dynamic";

const weekdayOf = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" });
const dateShortOf = (d: Date) =>
  d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) {
    const canFound = await canFoundGroup(session.user.id);
    return <NoGroupNotice canFound={canFound} />;
  }
  const meId = session.user.id;

  const season = await getOrCreateActiveSeason(ctx.groupId);
  const dayScope = { seasonId: season.id, groupId: ctx.groupId };
  const [me, group, ranking, liveDay, plannedDay, stats, rules] = await Promise.all([
    prisma.player.findUnique({ where: { id: meId }, select: { avatarVersion: true } }),
    prisma.group.findUnique({ where: { id: ctx.groupId }, select: { name: true } }),
    computeRanking(season.id),
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
    computePlayerSeasonStats(meId, season.id),
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
    const confirmedParts = plannedDay.participants.filter((p) => p.attendance === "confirmed");
    const base = {
      gameDayId: plannedDay.id,
      weekday: weekdayOf(plannedDay.date),
      dateShort: dateShortOf(plannedDay.date),
      startTime: plannedDay.startTime,
      countdown: countdownLabel(daysUntil(plannedDay.date, new Date())),
      confirmed: confirmedParts.length,
      pending: plannedDay.participants.filter((p) => p.attendance === "pending").length,
      total: plannedDay.participants.length,
      pips: confirmedParts.map((p) => ({
        playerId: p.playerId,
        name: p.player.name,
        avatarVersion: p.player.avatarVersion,
      })),
    };
    const mine = plannedDay.participants.find((p) => p.playerId === meId);
    const heroState: HeroState = !mine
      ? { kind: "not-member", ...base }
      : {
          kind: "member",
          ...base,
          attendance:
            mine.attendance === "confirmed" || mine.attendance === "declined" || mine.attendance === "joker"
              ? mine.attendance
              : "pending",
          jokersRemaining: stats.jokers.remaining,
          jokersTotal: stats.jokers.total,
          jokerGamesCredited: rules.jokerGamesCredited,
          ppgSnapshot: hasPlayed ? myRow.pointsPerGame : null,
        };
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
      <header className="flex items-center gap-3">
        <Avatar playerId={meId} name={session.user.name ?? ""} avatarVersion={me?.avatarVersion ?? 0} size={48} />
        <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          Hi{firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      <EmailNotice playerId={meId} />

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
          rank={myRow.rank}
          rankedCount={ranking.length}
          attended={stats.attendance.attended}
          totalDays={stats.attendance.total}
          jokersUsed={stats.jokers.used}
          form={[...stats.recentDays].reverse().map((d) => d.ppg)}
          muted={recapTicket !== null}
        />
      ) : (
        <SeasonCardEmpty seasonName={season.name} jokersRemaining={stats.jokers.remaining} />
      )}

      {tableRows.length > 0 && <LeagueTable rows={tableRows} />}

      {hasPlayed && <TrophyShelf medals={stats.medals} />}

      {stats.bestPartner && <DuoCards best={stats.bestPartner} worst={stats.worstPartner} />}
    </div>
  );
}
