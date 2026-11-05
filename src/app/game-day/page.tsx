import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { contextFromSession } from "@/lib/auth/group-context";
import { NoGroupNotice } from "@/components/no-group-notice";
import { Avatar } from "@/components/ui/avatar";
import { LABEL, MEDAL } from "@/components/home/styles";
import { prisma } from "@/lib/db";
import { shouldSubscribeToLiveUpdates, type GameDayStatus } from "./phase";
import { AddExtraMatchButton } from "./add-extra-match-button";
import { FinishBanner } from "./finish-banner";
import { FinishedSummary } from "./finished-summary";
import { StartGameDayButton } from "./start-game-day-button";
import { ShufflePreviewButton } from "./shuffle-preview-button";
import { GameDayLiveUpdates } from "./live-updates";
import { RefreshButton } from "./refresh-button";
import { CurrentMatch } from "./current-match";
import { MatchRows, type RowMatch } from "./match-rows";
import { DashboardHero } from "../dashboard-hero";
import { computeDayLiveStandings } from "@/lib/game-day/live-standings";
import { assignPlayersToTemplate, sortPlayersForAssignment } from "@/lib/pairings/assign";
import { loadTemplate } from "@/lib/pairings/load";
import { buildHeroState, dateShortOf } from "@/lib/home/hero-state";
import { computeRanking } from "@/lib/ranking/compute";
import { getGroupRules } from "@/lib/group/rules";

export const dynamic = "force-dynamic";

const NEXT_SHOWN = 2;
const STANDINGS_SHOWN = 3;

const CARD = "overflow-hidden rounded-[18px] border border-border bg-surface";
const CARD_HEAD = `flex items-center justify-between border-b border-border px-3 py-2.5 ${LABEL}`;
const ICON_BTN =
  "grid size-11 place-items-center rounded-xl border border-border bg-surface text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function CreateGameDayLink() {
  return (
    <Link href="/admin/spieltage" aria-label="Spieltag anlegen" className={`${ICON_BTN} text-xl font-semibold text-primary`}>
      <span aria-hidden="true">＋</span>
    </Link>
  );
}

const WEEKDAY_SHORT = (d: Date) => d.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" }).replace(".", "");

const ROSTER_GROUPS = [
  { key: "confirmed", label: "Dabei" },
  { key: "pending", label: "Offen" },
  { key: "joker", label: "Joker" },
  { key: "declined", label: "Abgesagt" },
] as const;

export default async function GameDayPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) return <NoGroupNotice />;
  const meId = session.user.id;
  const isAdmin = session.user.isAdmin;

  const dayInclude = {
    participants: { include: { player: { select: { id: true, name: true, avatarVersion: true } } } },
    matches: {
      orderBy: { matchNumber: "asc" as const },
      include: {
        team1PlayerA: { select: { name: true } },
        team1PlayerB: { select: { name: true } },
        team2PlayerA: { select: { name: true } },
        team2PlayerB: { select: { name: true } },
        scoredBy: { select: { name: true } },
      },
    },
  };

  const activeDay = await prisma.gameDay.findFirst({
    where: { groupId: ctx.groupId, status: { in: ["planned", "in_progress"] } },
    orderBy: { date: "desc" },
    include: dayInclude,
  });
  const day =
    activeDay ??
    (await prisma.gameDay.findFirst({
      where: { groupId: ctx.groupId, status: "finished", date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { date: "desc" },
      include: dayInclude,
    }));

  if (!day) {
    return (
      <div className="space-y-3.5">
        <header className="flex items-end justify-between gap-3">
          <h1 className="font-display text-[30px] font-extrabold uppercase leading-none">Spieltag</h1>
          {isAdmin && <CreateGameDayLink />}
        </header>
        <p className="rounded-[18px] border border-dashed border-border p-4 text-sm text-foreground-muted">
          Kein Spieltag geplant. {isAdmin ? "Lege in der Verwaltung einen an." : "Ein Admin muss zuerst einen Spieltag anlegen."}
        </p>
      </div>
    );
  }

  const status = day.status as GameDayStatus;
  const me = day.participants.find((p) => p.playerId === meId) ?? null;
  const myName = me?.player.name ?? null;
  const kicker = `${WEEKDAY_SHORT(day.date)}, ${dateShortOf(day.date)}${day.startTime ? ` · ${day.startTime}` : ""}`;
  const canScore = isAdmin || me?.attendance === "confirmed" || me?.attendance === "joker";

  const templateTotal = day.playerCount ? loadTemplate(day.playerCount).totalMatches : Number.POSITIVE_INFINITY;
  const rows: RowMatch[] = day.matches.map((m) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    team1: [m.team1PlayerA.name, m.team1PlayerB.name],
    team2: [m.team2PlayerA.name, m.team2PlayerB.name],
    team1Score: m.team1Score,
    team2Score: m.team2Score,
    version: m.version,
    scoredByName: m.scoredBy?.name ?? null,
    scoredAt: m.scoredAt?.toISOString() ?? null,
    removable: isAdmin && status === "in_progress" && m.matchNumber > templateTotal,
  }));
  const isScored = (m: RowMatch) => m.team1Score !== null && m.team2Score !== null;

  return (
    <div className="space-y-3.5">
      {shouldSubscribeToLiveUpdates(status) && <GameDayLiveUpdates gameDayId={day.id} />}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={`${LABEL} text-primary`}>{kicker}</p>
          <h1 className="mt-1 font-display text-[30px] font-extrabold uppercase leading-none">Spieltag</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RefreshButton />
          {isAdmin && status === "in_progress" && (
            <Link href="/game-day/print" aria-label="Drucken" className={ICON_BTN}>
              <Printer aria-hidden="true" className="size-4" />
            </Link>
          )}
          {isAdmin && <CreateGameDayLink />}
        </div>
      </header>

      {status === "planned" && (await PlannedView({ day, meId, isAdmin }))}

      {status === "in_progress" && (
        <LiveView rows={rows} isScored={isScored} canScore={canScore} day={day} myName={myName} isAdmin={isAdmin} />
      )}

      {status === "finished" && (
        <>
          <FinishedSummary
            gameDayId={day.id}
            scoredMatchCount={rows.filter(isScored).length}
            totalMatchCount={rows.length}
          />
          {rows.length > 0 && (
            <section aria-labelledby="gd-matches" className={CARD}>
              <div className={CARD_HEAD}>
                <h2 id="gd-matches">Matches</h2>
                <span>{rows.length}</span>
              </div>
              <MatchRows matches={rows} playerCount={day.playerCount} canEdit={false} gameDayId={day.id} myName={myName} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

type Day = Prisma.GameDayGetPayload<{
  include: { participants: { include: { player: { select: { id: true; name: true; avatarVersion: true } } } } };
}>;

async function PlannedView({ day, meId, isAdmin }: { day: Day; meId: string; isAdmin: boolean }) {
  const [rules, jokersUsed, ranking] = await Promise.all([
    getGroupRules(day.groupId),
    prisma.jokerUse.count({ where: { playerId: meId, seasonId: day.seasonId } }),
    computeRanking(day.seasonId),
  ]);
  const myRow = ranking.find((r) => r.playerId === meId);
  const hero = buildHeroState(day, meId, {
    jokersRemaining: Math.max(0, rules.jokersPerSeason - jokersUsed),
    jokersTotal: rules.jokersPerSeason,
    jokerGamesCredited: rules.jokerGamesCredited,
    ppgSnapshot: myRow && myRow.games > 0 ? myRow.pointsPerGame : null,
    now: new Date(),
  });

  const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
  const showPreview = confirmed.length >= 4 && confirmed.length <= 6;
  const plans = showPreview
    ? assignPlayersToTemplate(
        sortPlayersForAssignment(confirmed.map((p) => ({ id: p.playerId, name: p.player.name }))),
        day.seed ?? day.id,
      )
    : [];

  return (
    <>
      <DashboardHero state={hero} />

      <section aria-label="Teilnehmer" className={`${CARD} space-y-2.5 p-3`}>
        {ROSTER_GROUPS.map(({ key, label }) => {
          const list = day.participants
            .filter((p) => (key === "pending" ? !["confirmed", "joker", "declined"].includes(p.attendance) : p.attendance === key))
            .sort((a, b) => a.player.name.localeCompare(b.player.name, "de"));
          if (list.length === 0 && key !== "confirmed") return null;
          return (
            <div key={key}>
              <p className={LABEL}>
                {label} · {list.length}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {list.map((p) => (
                  <li
                    key={p.playerId}
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-surface-elevated py-1 pl-1 pr-2.5 text-[13px] ${
                      key === "confirmed" ? "border-lime/45" : key === "declined" ? "border-border opacity-55" : "border-border-strong"
                    } ${p.playerId === meId ? "ring-1 ring-primary" : ""}`}
                  >
                    <Avatar playerId={p.playerId} name={p.player.name} avatarVersion={p.player.avatarVersion} size={32} className="!size-6 text-[10px]" />
                    {p.player.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <details className={`${CARD} group`}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2.5">
          <span>
            <b className="block text-[14.5px]">Paarungen-Vorschau</b>
            <span className="text-xs text-foreground-muted">
              {showPreview ? `${confirmed.length} Zusagen · ändert sich bis zum Start` : "ab 4 Zusagen"}
            </span>
          </span>
          <span aria-hidden="true" className="text-primary transition group-open:rotate-90">
            ›
          </span>
        </summary>
        {showPreview && (
          <ol className="divide-y divide-border border-t border-border">
            {plans.map((m) => (
              <li key={m.matchNumber} className="grid grid-cols-[26px_1fr_auto_1fr] items-center gap-2 px-3 py-2 text-[13.5px]">
                <span className="text-center font-display text-base font-extrabold text-foreground-muted">{m.matchNumber}</span>
                <span className="truncate">
                  {m.team1[0].name} / {m.team1[1].name}
                </span>
                <span className="text-xs text-foreground-muted">gegen</span>
                <span className="truncate text-right">
                  {m.team2[0].name} / {m.team2[1].name}
                </span>
              </li>
            ))}
          </ol>
        )}
      </details>

      {isAdmin && showPreview && (
        <section aria-label="Admin" className="space-y-2">
          <p className={`px-1 ${LABEL}`}>Admin</p>
          <StartGameDayButton gameDayId={day.id} confirmedCount={confirmed.length} />
          <ShufflePreviewButton gameDayId={day.id} />
        </section>
      )}
    </>
  );
}

async function LiveView({
  rows,
  isScored,
  canScore,
  day,
  myName,
  isAdmin,
}: {
  rows: RowMatch[];
  isScored: (m: RowMatch) => boolean;
  canScore: boolean;
  day: { id: string; playerCount: number | null };
  myName: string | null;
  isAdmin: boolean;
}) {
  const standings = await computeDayLiveStandings(day.id);
  const current = rows.find((m) => !isScored(m)) ?? null;
  const open = rows.filter((m) => !isScored(m) && m !== current);
  const scored = rows.filter(isScored);
  const next = open.slice(0, NEXT_SHOWN);
  const later = open.slice(NEXT_SHOWN);
  const plays = (m: RowMatch) => myName !== null && [...m.team1, ...m.team2].includes(myName);
  const myNext = open.find(plays);
  const nextLabel = open[0]
    ? `Danach: Match ${open[0].matchNumber}${myNext && myNext !== open[0] ? ` · du spielst in Match ${myNext.matchNumber}` : plays(open[0]) ? " · du spielst" : ""}`
    : null;

  return (
    <>
      <CurrentMatch
        current={current}
        segments={rows.map((m) => (isScored(m) ? "done" : m === current ? "current" : "open"))}
        playerCount={day.playerCount}
        canEdit={canScore}
        nextLabel={nextLabel}
      />

      {!current && isAdmin && rows.length > 0 && <FinishBanner gameDayId={day.id} />}

      {next.length > 0 && (
        <section aria-labelledby="gd-next" className={CARD}>
          <div className={CARD_HEAD}>
            <h2 id="gd-next">Als Nächstes</h2>
            {myNext && !next.includes(myNext) && <span>du spielst in Match {myNext.matchNumber}</span>}
          </div>
          <MatchRows matches={next} playerCount={day.playerCount} canEdit={canScore} gameDayId={day.id} myName={myName} />
          {later.length > 0 && (
            <details className="group border-t border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-primary">
                Alle {open.length} offenen Matches
                <span aria-hidden="true" className="transition group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="border-t border-border">
                <MatchRows matches={later} playerCount={day.playerCount} canEdit={canScore} gameDayId={day.id} myName={myName} />
              </div>
            </details>
          )}
        </section>
      )}

      {standings && standings.scoredMatchCount > 0 && (
        <section aria-labelledby="gd-standings" className={CARD}>
          <div className={CARD_HEAD}>
            <h2 id="gd-standings">Tagesranking</h2>
            <span>
              {standings.scoredMatchCount} / {standings.totalMatchCount} gewertet
            </span>
          </div>
          <StandingList rows={standings.rows.slice(0, STANDINGS_SHOWN)} myName={myName} />
          {standings.rows.length > STANDINGS_SHOWN && (
            <details className="group border-t border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-primary">
                Ganzes Tagesranking
                <span aria-hidden="true" className="transition group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="border-t border-border">
                <StandingList rows={standings.rows.slice(STANDINGS_SHOWN)} myName={myName} />
              </div>
            </details>
          )}
        </section>
      )}

      {scored.length > 0 && (
        <section aria-labelledby="gd-scored" className={CARD}>
          <div className={CARD_HEAD}>
            <h2 id="gd-scored">Gewertet · {scored.length}</h2>
            {canScore && <span>antippen zum Korrigieren</span>}
          </div>
          <MatchRows matches={scored} playerCount={day.playerCount} canEdit={canScore} gameDayId={day.id} myName={myName} />
        </section>
      )}

      {canScore && <AddExtraMatchButton gameDayId={day.id} />}
    </>
  );
}

function StandingList({
  rows,
  myName,
}: {
  rows: { playerId: string; playerName: string; avatarVersion: number; rank: number; points: number; matches: number }[];
  myName: string | null;
}) {
  return (
    <ol className="divide-y divide-border">
      {rows.map((r) => {
        const mine = r.playerName === myName;
        return (
          <li
            key={r.playerId}
            aria-current={mine ? "true" : undefined}
            className={`grid grid-cols-[24px_32px_1fr_auto_40px] items-center gap-2 px-3 py-2 text-sm ${mine ? "bg-[linear-gradient(90deg,rgba(34,211,238,0.14),transparent)] shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
          >
            <span className="text-center" role="img" aria-label={`Platz ${r.rank}`}>
              {MEDAL[r.rank] ?? <span className="font-display text-base font-extrabold text-foreground-muted">{r.rank}</span>}
            </span>
            <Avatar playerId={r.playerId} name={r.playerName} avatarVersion={r.avatarVersion} size={32} />
            <span className="truncate font-semibold">{r.playerName}</span>
            <span className="text-xs text-foreground-muted">
              {r.matches} {r.matches === 1 ? "Match" : "Matches"}
            </span>
            <span className="text-right font-display text-xl font-extrabold tabular-nums">{r.points}</span>
          </li>
        );
      })}
    </ol>
  );
}
