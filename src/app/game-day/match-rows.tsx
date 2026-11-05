"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatScoredBy } from "@/lib/match/scored-by";
import { ScoreEditor, type EditableMatch } from "./score-editor";

const OPEN_MATCH_EVENT = "padel:open-match";
// Survives until the requested match appears in some list (it may only show up
// after the next refresh, e.g. right after scoring the current match).
let pendingOpen: string | null = null;

export function requestOpenMatch(id: string) {
  pendingOpen = id;
  window.dispatchEvent(new CustomEvent(OPEN_MATCH_EVENT, { detail: id }));
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export interface RowMatch extends EditableMatch {
  scoredByName: string | null;
  scoredAt: string | null;
  removable: boolean;
}

function Names({ names, me, align }: { names: [string, string]; me: string | null; align: "left" | "right" }) {
  return (
    <span className={`min-w-0 truncate ${align === "right" ? "text-right" : ""}`}>
      {names.map((n, i) => (
        <span key={i}>
          {i > 0 && " / "}
          <span className={n === me ? "font-semibold text-primary" : ""}>{n}</span>
        </span>
      ))}
    </span>
  );
}

function RemoveButton({ gameDayId, matchId }: { gameDayId: string; matchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/matches/${matchId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(
        res?.status === 409
          ? "Spieltag ist nicht mehr aktiv – Seite neu laden."
          : res?.status === 403
            ? "Nur Admins dürfen Matches entfernen."
            : "Konnte Match nicht entfernen.",
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4">
      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={remove} className={`min-h-11 rounded-xl border border-destructive/40 bg-destructive-soft text-sm font-semibold text-destructive ${FOCUS}`}>
            {busy ? "…" : "Wirklich entfernen"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`min-h-11 rounded-xl border border-border text-sm font-semibold ${FOCUS}`}>
            Behalten
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`min-h-11 w-full rounded-xl text-sm font-semibold text-destructive ${FOCUS}`}>
          Zusatz-Match entfernen
        </button>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function MatchRows({
  matches,
  playerCount,
  canEdit,
  gameDayId,
  myName,
}: {
  matches: RowMatch[];
  playerCount: number | null;
  canEdit: boolean;
  gameDayId: string;
  myName: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement>());

  const ids = matches.map((m) => m.id).join(",");
  useEffect(() => {
    function tryOpen() {
      const id = pendingOpen;
      if (!id || !matches.some((m) => m.id === id)) return;
      pendingOpen = null;
      setOpenId(id);
      refs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    tryOpen();
    window.addEventListener(OPEN_MATCH_EVENT, tryOpen);
    return () => window.removeEventListener(OPEN_MATCH_EVENT, tryOpen);
    // Re-check whenever the set of rows changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return (
    <ul className="divide-y divide-border">
      {matches.map((m) => {
        const scored = m.team1Score !== null && m.team2Score !== null;
        const open = openId === m.id;
        const content = (
          <>
            <span className="text-center font-display text-base font-extrabold text-foreground-muted">{m.matchNumber}</span>
            <Names names={m.team1} me={myName} align="left" />
            <span data-testid="score" className={`min-w-11 text-center font-display text-xl font-extrabold tabular-nums ${scored ? "" : "text-foreground-muted"}`}>
              {scored ? (
                <>
                  <span className={m.team1Score! > m.team2Score! ? "text-lime" : ""}>{m.team1Score}</span>:
                  <span className={m.team2Score! > m.team1Score! ? "text-lime" : ""}>{m.team2Score}</span>
                </>
              ) : (
                "–:–"
              )}
            </span>
            <Names names={m.team2} me={myName} align="right" />
          </>
        );
        const rowClass = "grid w-full grid-cols-[26px_1fr_auto_1fr] items-center gap-2 px-3 py-2.5 text-left text-[13.5px]";
        return (
          <li
            key={m.id}
            ref={(el) => {
              if (el) refs.current.set(m.id, el);
              else refs.current.delete(m.id);
            }}
            data-match-number={m.matchNumber}
            className={open ? "bg-surface-elevated/60" : ""}
          >
            {canEdit ? (
              <button
                type="button"
                aria-expanded={open}
                aria-label={`Match ${m.matchNumber}, ${m.team1.join(" & ")} gegen ${m.team2.join(" & ")}, ${
                  scored ? `${m.team1Score}:${m.team2Score}, korrigieren` : "eintragen"
                }`}
                className={`${rowClass} min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`}
                onClick={() => setOpenId(open ? null : m.id)}
              >
                {content}
              </button>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
            {open && (
              <div className="px-3 pb-3">
                <ScoreEditor
                  match={m}
                  playerCount={playerCount}
                  size="row"
                  onSaved={() => setOpenId(null)}
                  onCancel={() => setOpenId(null)}
                />
                {scored && (
                  <p className="mt-1.5 text-center text-[11.5px] text-foreground-muted">
                    {formatScoredBy(m.scoredByName, m.scoredAt)}
                  </p>
                )}
                {m.removable && <RemoveButton gameDayId={gameDayId} matchId={m.id} />}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
