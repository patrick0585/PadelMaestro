"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GroupedList, ListRow, SectionLabel } from "@/components/ui/list";
import { Avatar } from "@/components/ui/avatar";
import { EditPlayerDialog } from "../../edit-player-dialog";
import { ResetPasswordDialog } from "../../reset-password-dialog";
import { AvatarDialog } from "../../avatar-dialog";
import { TransferOwnerDialog } from "../../transfer-owner-dialog";
import { DeletePlayerDialog } from "../../delete-player-dialog";
import { RolePicker } from "./role-picker";
import type { PlayerDetail } from "@/lib/admin/player-detail";
import type { GroupRole } from "@/lib/auth/roles";

type Dialog = "edit" | "role" | "password" | "avatar" | "transfer" | "delete" | null;

const ROLE_LABEL: Record<GroupRole, string> = {
  owner: "Besitzer",
  admin: "Admin",
  member: "Mitglied",
};

function seasonValue(p: PlayerDetail): string {
  if (p.seasonPpg === null) return "Noch keine Spiele";
  return `${p.seasonGold} 🥇 · ${p.seasonPpg.toFixed(2)} PPG`;
}

export function PlayerDetailView({
  player,
  viewerRole,
}: {
  player: PlayerDetail;
  viewerRole: GroupRole;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const isOwnerTarget = player.role === "owner";
  const canTransfer = viewerRole === "owner" && !isOwnerTarget && player.hasPassword;
  const since = player.joinedAt.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto max-w-2xl">
      <nav className="flex items-center justify-between">
        <Link
          href="/admin/spieler"
          className="inline-flex min-h-11 items-center gap-1 rounded text-[15px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true">‹</span>
          Spieler
        </Link>
        <button
          type="button"
          onClick={() => setDialog("edit")}
          className="min-h-11 rounded px-1 text-[15px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Bearbeiten
        </button>
      </nav>
      <div className="mb-1.5 mt-1 flex flex-col items-center text-center">
        <Avatar playerId={player.id} name={player.name} avatarVersion={player.avatarVersion} size={96} />
        <h1 className="mt-2 text-xl font-extrabold">{player.name}</h1>
        <p className="text-xs text-foreground-muted">{`Mitglied seit ${since}`}</p>
      </div>

      <GroupedList className="mt-3">
        <ListRow title="E-Mail" value={player.email} />
        {isOwnerTarget ? (
          <ListRow title="Rolle" value={ROLE_LABEL.owner} />
        ) : (
          <ListRow
            title="Rolle"
            value={ROLE_LABEL[player.role]}
            chevron
            onClick={() => setDialog("role")}
          />
        )}
        <ListRow title="Diese Saison" value={seasonValue(player)} />
      </GroupedList>

      <SectionLabel>Konto</SectionLabel>
      <GroupedList>
        <ListRow title="Profilbild ändern" tone="primary" onClick={() => setDialog("avatar")} />
        <ListRow
          title={player.hasPassword ? "Passwort zurücksetzen" : "Passwort setzen"}
          tone="primary"
          onClick={() => setDialog("password")}
        />
        {canTransfer && (
          <ListRow title="Besitz übertragen…" tone="primary" onClick={() => setDialog("transfer")} />
        )}
      </GroupedList>

      {!isOwnerTarget && (
        <GroupedList className="mt-4">
          <ListRow
            title="Aus der Gruppe entfernen"
            tone="destructive"
            align="center"
            onClick={() => setDialog("delete")}
          />
        </GroupedList>
      )}

      <EditPlayerDialog
        open={dialog === "edit"}
        onClose={close}
        player={{
          id: player.id,
          name: player.name,
          email: player.email,
          username: player.username,
        }}
      />
      {!isOwnerTarget && (
        <RolePicker
          open={dialog === "role"}
          onClose={close}
          playerId={player.id}
          playerName={player.name}
          currentRole={player.role === "admin" ? "admin" : "member"}
        />
      )}
      <ResetPasswordDialog
        open={dialog === "password"}
        onClose={close}
        playerId={player.id}
        playerName={player.name}
        hasPassword={player.hasPassword}
      />
      <AvatarDialog
        open={dialog === "avatar"}
        onClose={close}
        playerId={player.id}
        playerName={player.name}
        avatarVersion={player.avatarVersion}
      />
      <TransferOwnerDialog
        open={dialog === "transfer"}
        onClose={close}
        player={{ id: player.id, name: player.name }}
      />
      <DeletePlayerDialog
        open={dialog === "delete"}
        onClose={close}
        playerId={player.id}
        playerName={player.name}
        playerEmail={player.email}
        onDeleted={() => router.push("/admin/spieler")}
      />
    </div>
  );
}
