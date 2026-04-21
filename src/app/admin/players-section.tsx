"use client";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatePlayerDialog } from "./create-player-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PlayerRow | null>(null);

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
              className="flex items-center justify-between rounded-xl border border-border p-3"
            >
              <div className="text-sm">
                <div className="font-medium text-foreground">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {p.isAdmin && <Badge variant="primary">Admin</Badge>}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
                {p.hasPassword && (
                  <Button variant="ghost" size="sm" onClick={() => setResetFor(p)}>
                    Passwort
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
      />
    </Card>
  );
}
