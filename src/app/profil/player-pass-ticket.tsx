import Link from "next/link";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TICKET_HEAD, TICKET_PILL } from "@/components/home/styles";
import { formatMemberSince, type PlayerPass } from "@/lib/profile/player-pass";

export interface PlayerPassTicketProps extends PlayerPass {
  playerId: string;
  name: string;
  avatarVersion: number;
  groupName: string | null;
  roleLabel: string | null;
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <dt className="order-2 text-xs text-[#d9f6fb]">{label}</dt>
      <dd className={`order-1 font-display text-[26px] font-extrabold leading-tight tabular-nums ${accent ? "text-lime" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

export function PlayerPassTicket(props: PlayerPassTicketProps) {
  const { playerId, name, avatarVersion, groupName, roleLabel, memberSince, seasonName, stats } = props;
  return (
    <section aria-label="Spielerpass" className="ticket">
      <div className={TICKET_HEAD}>
        <span className="min-w-0 truncate">Spielerpass{groupName ? ` · ${groupName}` : ""}</span>
        {roleLabel && <span className={`shrink-0 ${TICKET_PILL}`}>{roleLabel}</span>}
      </div>
      <div className="mt-3 flex items-center gap-3.5">
        <Link
          href="/profil/foto"
          aria-label="Profilbild ändern"
          className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e7490]"
        >
          <Avatar playerId={playerId} name={name} avatarVersion={avatarVersion} size={64} className="ring-2 ring-white/30" />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 grid size-[26px] place-items-center rounded-full border-2 border-[#0e7490] bg-surface-elevated text-foreground"
          >
            <Camera className="size-3.5" />
          </span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[32px] font-extrabold leading-none text-white">{name}</h1>
          {memberSince && <p className="mt-1 text-[13px] text-[#d9f6fb]">{formatMemberSince(memberSince)}</p>}
        </div>
      </div>
      {seasonName && (
        <>
          <div className="ticket-perf" />
          {stats ? (
            <dl aria-label={seasonName} className="grid grid-cols-3 text-center text-[#e2f8ff]">
              <Stat label="Rang" value={`${stats.rank}.`} />
              <Stat label="Ø Punkte" value={stats.ppg.toFixed(2)} accent />
              <Stat label={stats.attended === 1 ? "Spieltag" : "Spieltage"} value={String(stats.attended)} />
            </dl>
          ) : (
            <p className="text-center text-[13px] text-[#d9f6fb]">Noch keine Spiele in {seasonName}</p>
          )}
        </>
      )}
    </section>
  );
}
