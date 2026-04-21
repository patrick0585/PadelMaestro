"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import type { MatchRow } from "./match-list";

const PRESETS = {
  "first-to-3": [
    { team1: 3, team2: 0 },
    { team1: 3, team2: 1 },
    { team1: 3, team2: 2 },
    { team1: 2, team2: 3 },
    { team1: 1, team2: 3 },
    { team1: 0, team2: 3 },
  ],
  "first-to-6": [
    { team1: 6, team2: 0 },
    { team1: 6, team2: 2 },
    { team1: 6, team2: 4 },
    { team1: 4, team2: 6 },
    { team1: 2, team2: 6 },
    { team1: 0, team2: 6 },
  ],
} as const;

export function ScoreDialog({
  match,
  format,
  onClose,
  onSaved,
}: {
  match: MatchRow;
  format: "first-to-3" | "first-to-6";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<{ team1: number; team2: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        team1Score: selected.team1,
        team2Score: selected.team2,
        version: match.version,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.status === 409) setError("Das Spiel wurde zwischenzeitlich geändert");
      else setError("Speichern fehlgeschlagen");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onClose={onClose} title={`Ergebnis — Spiel #${match.matchNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          <span className="font-medium">{match.team1A} &amp; {match.team1B}</span>
          <span className="text-muted-foreground"> vs </span>
          <span className="font-medium">{match.team2A} &amp; {match.team2B}</span>
        </p>

        <div>
          <Label>Ergebnis wählen</Label>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS[format].map((p) => {
              const active = selected?.team1 === p.team1 && selected?.team2 === p.team2;
              return (
                <button
                  key={`${p.team1}-${p.team2}`}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "bg-primary-soft border-primary-border text-primary"
                      : "bg-surface border-border text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {p.team1}:{p.team2}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!selected} loading={saving}>
            Speichern
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
