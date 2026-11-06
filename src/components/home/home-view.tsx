"use client";
import { DashboardHero, type HeroState } from "@/app/dashboard-hero";
import { EmailNoticeClient } from "@/components/email-notice-client";
import type { EmailNoticeData } from "@/components/email-notice-types";
import type { LiveTicket as LiveTicketData } from "@/lib/home/live-ticket";
import { LiveTicket } from "./live-ticket";
import { RecapTicket, type RecapRow } from "./recap-ticket";
import { SeasonCard, SeasonCardEmpty, type SeasonCardProps } from "./season-card";
import { LeagueTable, type LeagueRow } from "./league-table";

export type HomeSeason =
  | { kind: "played"; card: SeasonCardProps }
  | { kind: "empty"; seasonName: string; jokersRemaining: number };

export interface HomeViewProps {
  firstName: string;
  emailNotice: EmailNoticeData | null;
  live: LiveTicketData | null;
  hero: HeroState | null;
  recap: { dateLabel: string | null; podium: RecapRow[] } | null;
  season: HomeSeason;
  table: { rows: LeagueRow[]; myGap: string | null } | null;
}

/**
 * The whole home page as ONE client component fed by plain props. As server components the cards
 * were streamed as separate deferred Flight rows (React defers elements once a row passes ~3.2 KB);
 * hydration then suspends on a row that is still in transit and React replays the host element
 * (`div`/`section`) against a DOM cursor that already moved on: sporadic hydration error #418.
 * Plain props carry no deferred elements, so there is nothing to suspend on.
 *
 * Keep this tree free of async server components and server-rendered children (see #418).
 */
export function HomeView({ firstName, emailNotice, live, hero, recap, season, table }: HomeViewProps) {
  return (
    <div className="space-y-3.5">
      <header>
        <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">
          Hi{firstName ? `, ${firstName}` : ""}
        </h1>
      </header>

      {emailNotice && <EmailNoticeClient {...emailNotice} compact />}

      {live && <LiveTicket data={live} />}
      {hero && <DashboardHero state={hero} />}
      {recap && <RecapTicket dateLabel={recap.dateLabel} podium={recap.podium} />}

      {season.kind === "played" ? (
        <SeasonCard {...season.card} muted={recap !== null} />
      ) : (
        <SeasonCardEmpty seasonName={season.seasonName} jokersRemaining={season.jokersRemaining} />
      )}

      {table && table.rows.length > 0 && <LeagueTable rows={table.rows} myGap={table.myGap} />}
    </div>
  );
}
