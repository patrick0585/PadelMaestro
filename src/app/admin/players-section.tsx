"use client";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatePlayerDialog } from "./create-player-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { EditPlayerDialog, type EditablePlayer } from "./edit-player-dialog";
import { DeletePlayerDialog } from "./delete-player-dialog";
import { AvatarDialog } from "./avatar-dialog";
import { TransferOwnerDialog } from "./transfer-owner-dialog";
import type { GroupRole } from "@/lib/auth/roles";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  role: GroupRole;
  hasPassword: boolean;
  emailVerified: boolean;
  avatarVersion: number;
}

export function PlayersSection({
  players,
  viewerRole,
}: {
  players: PlayerRow[];
  viewerRole: GroupRole;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PlayerRow | null>(null);
  const [editFor, setEditFor] = useState<EditablePlayer | null>(null);
  const [deleteFor, setDeleteFor] = useState<PlayerRow | null>(null);
  const [avatarFor, setAvatarFor] = useState<PlayerRow | null>(null);
  const [transferFor, setTransferFor] = useState<PlayerRow | null>(null);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Spieler</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Spieler hinzufügen
          </Button>
        </div>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-medium text-foreground">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.email}
                  {p.username && <span className="ml-2">· @{p.username}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {p.role === "owner" ? (
                  <Badge variant="primary">Besitzer</Badge>
                ) : (
                  p.isAdmin && <Badge variant="primary">Admin</Badge>
                )}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
                {p.hasPassword && !p.emailVerified && <Badge variant="neutral">Unbestätigt</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Spieler ${p.name} bearbeiten`}
                  onClick={() =>
                    setEditFor({
                      id: p.id,
                      name: p.name,
                      email: p.email,
                      username: p.username,
                      isAdmin: p.isAdmin,
                      role: p.role,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetFor(p)}>
                  {p.hasPassword ? "Passwort" : "Passwort setzen"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAvatarFor(p)}>
                  Avatar
                </Button>
                {viewerRole === "owner" && p.role !== "owner" && p.hasPassword && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Besitz übertragen an ${p.name}`}
                    onClick={() => setTransferFor(p)}
                  >
                    Besitz übertragen
                  </Button>
                )}
                {p.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Spieler ${p.name} löschen`}
                    onClick={() => setDeleteFor(p)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
      <CreatePlayerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordDialog
        open={resetFor !== null}
        onClose={() => setResetFor(null)}
        playerId={resetFor?.id ?? null}
        playerName={resetFor?.name ?? null}
        hasPassword={resetFor?.hasPassword ?? true}
      />
      <EditPlayerDialog
        open={editFor !== null}
        onClose={() => setEditFor(null)}
        player={editFor}
      />
      <DeletePlayerDialog
        open={deleteFor !== null}
        onClose={() => setDeleteFor(null)}
        playerId={deleteFor?.id ?? null}
        playerName={deleteFor?.name ?? null}
        playerEmail={deleteFor?.email ?? null}
      />
      <AvatarDialog
        open={avatarFor !== null}
        onClose={() => setAvatarFor(null)}
        playerId={avatarFor?.id ?? null}
        playerName={avatarFor?.name ?? null}
        avatarVersion={avatarFor?.avatarVersion ?? 0}
      />
      <TransferOwnerDialog
        open={transferFor !== null}
        onClose={() => setTransferFor(null)}
        player={transferFor}
      />
    </Card>
  );
}
