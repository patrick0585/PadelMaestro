"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { GroupedList, LargeTitle, ListRow, SectionLabel } from "@/components/ui/list";
import { Avatar } from "@/components/ui/avatar";
import { CreatePlayerDialog } from "../create-player-dialog";
import type { MemberRow } from "@/lib/group/members";

function RolePill({ role }: { role: MemberRow["role"] }) {
  if (role === "member") return null;
  const owner = role === "owner";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        owner ? "bg-amber-400/15 text-amber-400" : "bg-primary-soft text-primary"
      }`}
    >
      {owner ? "Besitzer" : "Admin"}
    </span>
  );
}

function PlayerRows({ players }: { players: MemberRow[] }) {
  return (
    <GroupedList>
      {players.map((p) => {
        const unverified = p.hasPassword && !p.emailVerified;
        return (
          <ListRow
            key={p.id}
            href={`/admin/spieler/${p.id}`}
            leading={<Avatar playerId={p.id} name={p.name} avatarVersion={p.avatarVersion} size={32} />}
            title={p.name}
            subtitle={
              unverified ? (
                <span className="text-amber-400">E-Mail nicht bestätigt</span>
              ) : !p.hasPassword ? (
                "Nur Statistik"
              ) : undefined
            }
            trailing={<RolePill role={p.role} />}
            chevron
          />
        );
      })}
    </GroupedList>
  );
}

export function PlayersList({ players }: { players: MemberRow[] }) {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const visible = needle ? players.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) || (p.username ?? "").toLowerCase().includes(needle),
      ) : players;
  const admins = visible.filter((p) => p.role !== "member");
  const members = visible.filter((p) => p.role === "member");

  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle
        title="Spieler"
        back={{ href: "/admin", label: "Verwaltung" }}
        action={
          <button
            type="button"
            aria-label="Spieler anlegen"
            onClick={() => setCreateOpen(true)}
            className="grid size-11 place-items-center rounded-full text-[22px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            ＋
          </button>
        }
      />
      <label className="mb-1 flex min-h-11 items-center gap-2 rounded-[10px] bg-surface-list px-3 focus-within:ring-2 focus-within:ring-primary">
        <Search aria-hidden className="size-4 shrink-0 text-foreground-muted" />
        <input
          type="search"
          aria-label="Suchen"
          placeholder="Suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 w-full bg-transparent text-[14.5px] text-foreground placeholder:text-foreground-muted focus:outline-none"
        />
      </label>
      {visible.length === 0 && (
        <p className="mx-3.5 mt-6 text-center text-sm text-foreground-muted">
          Keine Spieler gefunden
        </p>
      )}
      {admins.length > 0 && (
        <>
          <SectionLabel>Admins</SectionLabel>
          <PlayerRows players={admins} />
        </>
      )}
      {members.length > 0 && (
        <>
          <SectionLabel>{`Mitglieder · ${members.length}`}</SectionLabel>
          <PlayerRows players={members} />
        </>
      )}
      <CreatePlayerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
