"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreDialog } from "./score-dialog";

export interface MatchRow {
  id: string;
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
  team1Score: number | null;
  team2Score: number | null;
  version: number;
}

export function MatchList({
  format,
  matches,
}: {
  format: "first-to-3" | "first-to-6";
  matches: MatchRow[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = matches.find((m) => m.id === editingId) ?? null;

  async function undo(id: string) {
    const res = await fetch(`/api/matches/${id}/undo`, { method: "POST" });
    if (res.ok) router.refresh();
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const hasScore = m.team1Score !== null && m.team2Score !== null;
        return (
          <li key={m.id}>
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant="neutral">#{m.matchNumber}</Badge>
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      {m.team1A} &amp; {m.team1B}
                    </div>
                    <div className="text-xs text-muted-foreground">vs</div>
                    <div className="font-medium text-foreground">
                      {m.team2A} &amp; {m.team2B}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasScore ? (
                    <>
                      <div className="text-lg font-bold text-foreground">
                        {m.team1Score}:{m.team2Score}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => undo(m.id)}>
                        Zurück
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setEditingId(m.id)}>
                      Ergebnis
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          </li>
        );
      })}
      {editing && (
        <ScoreDialog
          match={editing}
          format={format}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      )}
    </ul>
  );
}
