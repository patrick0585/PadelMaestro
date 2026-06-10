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

// Map the English server-side validate.ts reasons to localized copy.
// We match by substring so wording tweaks on the server don't silently
// fall back to the generic message. Exported for direct testing.
export function germanInvalidReason(serverError: string): string {
  if (/tie/i.test(serverError)) return "Unentschieden ist nicht erlaubt.";
  if (/sum to 3/i.test(serverError)) return "Summe muss 3 ergeben (z. B. 3:0, 2:1, 1:2, 0:3).";
  if (/non-negative integers/i.test(serverError)) return "Nur ganze Zahlen ≥ 0 erlaubt.";
  if (/winner must reach at least 6/i.test(serverError)) return "Der Sieger muss mindestens 6 erreichen.";
  if (/2-game lead/i.test(serverError)) return "Mindestens 2 Spiele Vorsprung nötig.";
  return "Ungültiges Ergebnis.";
}

export function MatchInlineCard({
  match,
  maxScore,
  gameDayId,
  removable = false,
}: {
  match: MatchRow;
  maxScore: number;
  gameDayId: string;
  removable?: boolean;
}) {
  const router = useRouter();
  const hasScore = match.team1Score !== null && match.team2Score !== null;
  const [editing, setEditing] = useState(false);
  const [t1, setT1] = useState(match.team1Score ?? 0);
  const [t2, setT2] = useState(match.team2Score ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const winner = editing ? null : determineWinner(match.team1Score, match.team2Score);
  const scoredByHint = editing
    ? null
    : formatScoredBy(match.scoredByName, match.scoredAt);

  // Block save client-side on a tie (incl. 0:0) so the user gets
  // immediate feedback instead of a network round-trip + generic error.
  const isTie = t1 === t2;
  const saveDisabled = busy || isTie;

  function startEdit() {
    setT1(match.team1Score ?? 0);
    setT2(match.team2Score ?? 0);
    setError(null);
    setConfirmingRemove(false);
    setEditing(true);
  }

  async function remove() {
    setRemoving(true);
    setRemoveError(null);
    let res: Response;
    try {
      res = await fetch(`/api/game-days/${gameDayId}/matches/${match.id}`, {
        method: "DELETE",
      });
    } catch {
      // Network failure — re-enable the button so the user can retry.
      setRemoving(false);
      setRemoveError("Netzwerkfehler – bitte erneut versuchen.");
      return;
    }
    setRemoving(false);
    if (!res.ok) {
      if (res.status === 409) {
        setRemoveError("Spieltag ist nicht mehr aktiv – Seite neu laden.");
      } else if (res.status === 422) {
        setRemoveError("Dieses Match gehört zum festen Spielplan und kann nicht entfernt werden.");
      } else if (res.status === 403) {
        setRemoveError("Nur Admins dürfen Matches entfernen.");
      } else {
        setRemoveError("Konnte Match nicht entfernen.");
      }
      return;
    }
    setConfirmingRemove(false);
    router.refresh();
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
      // Temporary: surface the HTTP status alongside the copy so the
      // 2026-05-05 score-entry failures (where the only signal is a
      // user screenshot) can be classified — 401 vs 403 vs 409 vs 500
      // each implies a different root cause.
      const suffix = ` [HTTP ${res.status}]`;
      if (res.status === 409) {
        setError("Zwischenzeitlich geändert – Seite neu laden." + suffix);
      } else if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError((body?.error ? germanInvalidReason(body.error) : "Ungültiges Ergebnis.") + suffix);
      } else if (res.status === 403) {
        setError("Du darfst diesen Score nicht eintragen." + suffix);
      } else {
        setError("Konnte Score nicht speichern." + suffix);
      }
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
            disabled={saveDisabled}
            onClick={save}
            title={isTie ? "Unentschieden ist nicht erlaubt" : undefined}
            className="rounded-lg bg-[image:var(--cta-gradient)] px-2 py-1.5 text-xs font-extrabold text-background disabled:opacity-40"
          >
            Speichern
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            {scoredByHint ? (
              <span className="truncate text-[0.65rem] text-foreground-muted">{scoredByHint}</span>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-3">
              {removable && !confirmingRemove && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveError(null);
                    setConfirmingRemove(true);
                  }}
                  className="-my-1 py-1 text-[0.72rem] font-semibold text-destructive hover:underline"
                >
                  <span aria-hidden="true">🗑</span> entfernen
                </button>
              )}
              <button
                type="button"
                onClick={startEdit}
                className="-my-1 py-1 text-[0.72rem] font-semibold text-primary hover:underline"
              >
                {hasScore ? (
                  <>
                    <span aria-hidden="true">✎</span> bearbeiten
                  </>
                ) : (
                  "Tap zum Eintragen"
                )}
              </button>
            </div>
          </div>

          {confirmingRemove && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-destructive/40 bg-destructive-soft p-2"
            >
              <p className="text-xs text-foreground">
                Match {match.matchNumber} entfernen?
                {hasScore && (
                  <span className="mt-0.5 block font-semibold text-destructive">
                    <span aria-hidden="true">⚠ </span>Verändert die Tageswertung.
                  </span>
                )}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => setConfirmingRemove(false)}
                  className="rounded-lg border border-border-strong px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={removing}
                  onClick={remove}
                  className="rounded-lg bg-destructive px-2 py-1.5 text-xs font-extrabold text-background hover:bg-destructive/90 disabled:opacity-40"
                >
                  Ja, entfernen
                </button>
              </div>
              {removeError && <p className="mt-2 text-xs text-destructive">{removeError}</p>}
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
