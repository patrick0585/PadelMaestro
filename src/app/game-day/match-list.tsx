"use client";
import { useState } from "react";
import { ScoreDialog } from "./score-dialog";

interface MatchView {
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

export function MatchList({ format, matches }: { format: "first-to-3" | "first-to-6"; matches: MatchView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = matches.find((m) => m.id === openId);

  return (
    <ul className="divide-y">
      {matches.map((m) => {
        const hasScore = m.team1Score !== null;
        return (
          <li key={m.id} className="flex items-center justify-between py-3">
            <div>
              <span className="font-mono text-sm text-muted-foreground">#{m.matchNumber}</span>
              <span className="ml-3">
                {m.team1A} + {m.team1B} <span className="mx-2">vs</span> {m.team2A} + {m.team2B}
              </span>
            </div>
            {hasScore ? (
              <span className="font-semibold">
                {m.team1Score}:{m.team2Score}
              </span>
            ) : (
              <button
                onClick={() => setOpenId(m.id)}
                className="rounded border px-3 py-1 text-sm"
              >
                Eintragen
              </button>
            )}
          </li>
        );
      })}
      {open && (
        <ScoreDialog
          matchId={open.id}
          format={format}
          expectedVersion={open.version}
          onClose={() => setOpenId(null)}
        />
      )}
    </ul>
  );
}
