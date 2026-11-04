import Link from "next/link";
import { CalendarDays, Mail, Settings, Trophy, Users } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { GroupedList, LargeTitle, ListRow, SectionLabel } from "@/components/ui/list";
import { formatGameDayDate } from "@/lib/admin/format";
import type { AdminOverview } from "@/lib/admin/overview";

const ICON_CLASS = "size-[17px]";

function formatSeasonStart(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

const HERO_CLASS =
  "block rounded-[18px] border border-primary/50 bg-[image:var(--hero-gradient)] p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const HERO_KICKER = "text-[11px] font-bold uppercase tracking-[0.06em] text-[#a5f3fc]";

function Hero({ hero }: { hero: AdminOverview["hero"] }) {
  if (hero.kind === "none") {
    return (
      <div className={HERO_CLASS}>
        <p className={HERO_KICKER}>Nächster Spieltag</p>
        <p className="mb-0.5 mt-1 text-[19px] font-extrabold">Kein Spieltag geplant</p>
        <Link
          href="/admin/spieltage"
          className="inline-flex min-h-11 items-center text-[12.5px] font-semibold text-[#cffafe] underline underline-offset-2"
        >
          Spieltag anlegen
        </Link>
      </div>
    );
  }
  if (hero.kind === "running") {
    return (
      <Link href="/game-day" className={HERO_CLASS}>
        <p className={HERO_KICKER}>Läuft gerade</p>
        <p className="mb-0.5 mt-1 text-[19px] font-extrabold">{formatGameDayDate(hero.date)}</p>
        <p className="text-[12.5px] text-[#cffafe]">Zum laufenden Spieltag</p>
      </Link>
    );
  }
  return (
    <Link href={`/admin/spieltage/${hero.id}`} className={HERO_CLASS}>
      <p className={HERO_KICKER}>Nächster Spieltag</p>
      <p className="mb-0.5 mt-1 text-[19px] font-extrabold">{formatGameDayDate(hero.date)}</p>
      <p className="text-[12.5px] text-[#cffafe]">
        {hero.confirmed} von {hero.total} zugesagt · {hero.pending} offen
      </p>
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

      <SectionLabel>{seasonName}</SectionLabel>
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
          title="Saison"
          value={`seit ${formatSeasonStart(seasonStart)}`}
          chevron
        />
      </GroupedList>

      <SectionLabel>Mitglieder</SectionLabel>
      <GroupedList>
        <ListRow
          href="/admin/spieler"
          icon={{ node: <Users className={ICON_CLASS} />, color: "#0f766e" }}
          title="Spieler"
          value={
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">
              {memberCount}
            </span>
          }
          chevron
        />
        <ListRow
          href="/admin/einladen"
          icon={{ node: <Mail className={ICON_CLASS} />, color: "#15803d" }}
          title="Einladen"
          value={`${openInvitationCount} ${openInvitationCount === 1 ? "Link" : "Links"} offen`}
          chevron
        />
      </GroupedList>

      <SectionLabel>Gruppe</SectionLabel>
      <GroupedList>
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
