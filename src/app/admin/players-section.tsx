"use client";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Spieler</h2>
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
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
