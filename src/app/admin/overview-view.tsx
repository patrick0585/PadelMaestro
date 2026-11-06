import Link from "next/link";
import { CalendarDays, Mail, Settings, Trophy, Users } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { GroupedList, LargeTitle, ListRow, SectionLabel } from "@/components/ui/list";
import type { AdminOverview } from "@/lib/admin/overview";
import { formatDayMonth } from "@/lib/format-date";
import { AdminTicket, AttendanceBar, TicketLink, attendanceCaption, countdownPill } from "./admin-ticket";
import { TicketStartButton } from "./ticket-start-button";

const ICON_CLASS = "size-[17px]";
// Mirrors the 4–6 confirmed players startGameDay accepts.
const MIN_TO_START = 4;
const MAX_TO_START = 6;

function Hero({ hero }: { hero: AdminOverview["hero"] }) {
  if (hero.kind === "none") {
    return (
      <AdminTicket
        label="Nächster Spieltag"
        date={null}
        footer={
          <div className="grid">
            <TicketLink href="/admin/spieltage" go>
              ＋ Spieltag anlegen
            </TicketLink>
          </div>
        }
      />
    );
  }
  if (hero.kind === "running") {
    return (
      <AdminTicket
        label="Läuft gerade"
        date={hero.date}
        pill="Live"
        footer={
          <div className="grid">
            <TicketLink href="/game-day" go>
              Zum laufenden Spieltag
            </TicketLink>
          </div>
        }
      />
    );
  }
  const canStart = hero.confirmed >= MIN_TO_START && hero.confirmed <= MAX_TO_START;
  const counts = { confirmed: hero.confirmed, declined: hero.declined, joker: hero.joker, pending: hero.pending };
  return (
    <AdminTicket
      label="Nächster Spieltag"
      date={hero.date}
      startTime={hero.startTime}
      pill={countdownPill(hero.date)}
      footer={
        <div className={`grid gap-2 ${canStart ? "grid-cols-2" : ""}`}>
          <TicketLink href={`/admin/spieltage/${hero.id}`}>Zusagen</TicketLink>
          {canStart && <TicketStartButton gameDayId={hero.id} />}
        </div>
      }
    >
      <AttendanceBar counts={counts} decorative />
      <p className="mt-2 text-[13px] text-[#d9f6fb]">{attendanceCaption(counts)}</p>
      {hero.confirmed > MAX_TO_START && (
        <p className="mt-1 text-[13px] text-amber-200">Höchstens {MAX_TO_START} Zusagen – im Detail anpassen.</p>
      )}
    </AdminTicket>
  );
}

const TILE =
  "flex flex-col items-center rounded-[14px] bg-surface-list px-2 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function Tile({ href, value, label, accent = false }: { href: string; value: number; label: string; accent?: boolean }) {
  return (
    <Link href={href} aria-label={`${value} ${label}`} className={TILE}>
      <span className={`font-display text-[26px] font-extrabold leading-tight tabular-nums ${accent ? "text-lime" : ""}`}>
        {value}
      </span>
      <span className="text-xs text-foreground-muted">{label}</span>
    </Link>
  );
}

export function AdminOverviewView({
  hero,
  seasonName,
  seasonStart,
  finishedCount,
  plannedCount,
  memberCount,
  openInvitationCount,
  groupName,
  welcome,
}: AdminOverview & { welcome: boolean }) {
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Verwaltung" />
      {welcome && (
        <div className="mb-3">
          <InlineMessage kind="success">
            Deine Gruppe steht. Lade jetzt deine Mitspieler ein.
          </InlineMessage>
        </div>
      )}
      <Hero hero={hero} />

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Tile href="/admin/spieler" value={memberCount} label="Spieler" />
        <Tile href="/admin/einladen" value={openInvitationCount} label={openInvitationCount === 1 ? "Einladung" : "Einladungen"} />
        <Tile href="/admin/spieltage" value={finishedCount} label="Gespielt" accent />
      </div>

      <SectionLabel>Verwalten</SectionLabel>
      <GroupedList>
        <ListRow
          href="/admin/spieltage"
          icon={{ node: <CalendarDays className={ICON_CLASS} />, color: "#0e7490" }}
          title="Spieltage"
          subtitle={`${finishedCount} gespielt · ${plannedCount} geplant`}
          chevron
        />
        <ListRow
          href="/admin/saison"
          icon={{ node: <Trophy className={ICON_CLASS} />, color: "#4338ca" }}
          title={seasonName}
          value={`seit ${formatDayMonth(seasonStart)}`}
          chevron
        />
        <ListRow
          href="/admin/spieler"
          icon={{ node: <Users className={ICON_CLASS} />, color: "#0f766e" }}
          title="Spieler"
          chevron
        />
        <ListRow
          href="/admin/einladen"
          icon={{ node: <Mail className={ICON_CLASS} />, color: "#15803d" }}
          title="Einladen"
          value={`${openInvitationCount} ${openInvitationCount === 1 ? "Link" : "Links"} offen`}
          chevron
        />
        <ListRow
          href="/admin/einstellungen"
          icon={{ node: <Settings className={ICON_CLASS} />, color: "#475569" }}
          title="Einstellungen"
          subtitle={groupName}
          chevron
        />
      </GroupedList>
    </div>
  );
}
