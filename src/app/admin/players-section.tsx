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

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PlayerRow | null>(null);
  const [editFor, setEditFor] = useState<EditablePlayer | null>(null);
  const [deleteFor, setDeleteFor] = useState<PlayerRow | null>(null);

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
              <div className="flex shrink-0 items-center gap-2">
                {p.isAdmin && <Badge variant="primary">Admin</Badge>}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
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
                    })
                  }
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                {p.hasPassword && (
                  <Button variant="ghost" size="sm" onClick={() => setResetFor(p)}>
                    Passwort
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Spieler ${p.name} löschen`}
                  onClick={() => setDeleteFor(p)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
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
    </Card>
  );
}
