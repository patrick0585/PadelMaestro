"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/ui/stepper";
import { determineWinner } from "@/lib/game-day/match-display";
import { formatScoredBy } from "@/lib/match/scored-by";

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
  scoredByName: string | null;
  scoredAt: string | null;
}

export function MatchInlineCard({
  match,
  maxScore,
}: {
  match: MatchRow;
  maxScore: number;
}) {
  const router = useRouter();
  const hasScore = match.team1Score !== null && match.team2Score !== null;
  const [editing, setEditing] = useState(false);
  const [t1, setT1] = useState(match.team1Score ?? 0);
  const [t2, setT2] = useState(match.team2Score ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winner = editing ? null : determineWinner(match.team1Score, match.team2Score);
  const scoredByHint = editing
    ? null
    : formatScoredBy(match.scoredByName, match.scoredAt);

  function startEdit() {
    setT1(match.team1Score ?? 0);
    setT2(match.team2Score ?? 0);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team1Score: t1, team2Score: t2, expectedVersion: match.version }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 409 ? "Zwischenzeitlich geändert – Seite neu laden" : "Konnte Score nicht speichern");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        editing ? "border-primary bg-surface shadow-[0_0_0_4px_rgba(34,211,238,0.1)]" : "border-border bg-surface-muted"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Match {match.matchNumber}
          {editing ? " · Eingabe läuft" : hasScore ? " · beendet" : " · offen"}
        </span>
        {winner && (
          <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[0.6rem] font-bold text-success">
            {winner === "team1" ? "Team A gewinnt" : "Team B gewinnt"}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team1A} / {match.team1B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team A</div>
        </div>
        {editing ? (
          <Stepper value={t1} min={0} max={maxScore} onChange={setT1} label="Team A Score" />
        ) : (
          <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
            {match.team1Score ?? "–"}
          </span>
        )}
        <span className="text-xs font-semibold text-foreground-dim">:</span>
        {editing ? (
          <Stepper value={t2} min={0} max={maxScore} onChange={setT2} label="Team B Score" />
        ) : (
          <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
            {match.team2Score ?? "–"}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team2A} / {match.team2B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team B</div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
            className="rounded-lg border border-border-strong px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-[image:var(--cta-gradient)] px-2 py-1.5 text-xs font-extrabold text-background disabled:opacity-40"
          >
            Speichern
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          {scoredByHint ? (
            <span className="truncate text-[0.65rem] text-foreground-muted">{scoredByHint}</span>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 text-[0.72rem] font-semibold text-primary hover:underline"
          >
            {hasScore ? "✎ bearbeiten" : "Tap zum Eintragen"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
