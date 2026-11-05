"use client";
import { useEffect, useState } from "react";
import { ScoreEditor, type EditableMatch } from "./score-editor";
import { requestOpenMatch } from "./match-rows";

const TOAST_MS = 8000;

type Segment = "done" | "current" | "open";

const SEG: Record<Segment, string> = {
  done: "bg-lime",
  current: "bg-white anim-pulse",
  open: "bg-white/20",
};

export function CurrentMatch({
  current,
  segments,
  playerCount,
  canEdit,
  nextLabel,
}: {
  current: EditableMatch | null;
  segments: Segment[];
  playerCount: number | null;
  canEdit: boolean;
  nextLabel: string | null;
}) {
  const [saved, setSaved] = useState<{ id: string; number: number; score: [number, number]; winner: string } | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [saved]);

  const total = segments.length;
  const progress = current ? `Match ${current.matchNumber} von ${total}` : `Alle ${total} Matches gewertet`;

  return (
    <>
      <section aria-label="Laufendes Match" className="ticket" data-testid="current-match" data-match-number={current?.matchNumber}>
        <div className="flex items-center justify-between font-display text-[12.5px] font-bold uppercase tracking-[0.16em] text-[#d9f6fb]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[11.5px] tracking-[0.12em] text-white">
            <i aria-hidden="true" className="anim-pulse size-[7px] rounded-full bg-white" />
            Live
          </span>
          <span>{progress}</span>
        </div>
        {total > 0 && (
          <div className="mt-2.5 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
            {segments.map((s, i) => (
              <i key={i} className={`h-1.5 rounded-sm ${SEG[s]}`} />
            ))}
          </div>
        )}
        {current ? (
          <>
            <p className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#d9f6fb]">
              {canEdit ? "Ergebnis eintragen" : "Jetzt"}
            </p>
            <div className="mt-1.5">
              {canEdit ? (
                <ScoreEditor
                  key={current.id}
                  match={current}
                  playerCount={playerCount}
                  size="hero"
                  onSaved={(score) =>
                    setSaved({
                      id: current.id,
                      number: current.matchNumber,
                      score,
                      winner: (score[0] > score[1] ? current.team1 : current.team2).join(" & "),
                    })
                  }
                />
              ) : (
                <p className="rounded-2xl bg-black/50 p-3 text-center text-[15px] text-white">
                  {current.team1.join(" & ")} <span className="text-[#7dd3e0]">gegen</span> {current.team2.join(" & ")}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-[#d9f6fb]">Alle Ergebnisse sind eingetragen.</p>
        )}
        {nextLabel && <p className="mt-2.5 text-[13px] text-[#d9f6fb]">{nextLabel}</p>}
      </section>

      {/* Live region stays mounted so screen readers announce the toast text. */}
      <div role="status" className="contents">
      {saved && (
        <div
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[14px] bg-foreground px-3.5 py-2.5 text-sm text-background shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)]"
        >
          <span className="min-w-0">
            <b>
              Match {saved.number}: {saved.score[0]}:{saved.score[1]}
            </b>{" "}
            für {saved.winner}
          </span>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-lg px-1.5 font-bold text-[#0e7490] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7490]"
            onClick={() => {
              requestOpenMatch(saved.id);
              setSaved(null);
            }}
          >
            Korrigieren
          </button>
        </div>
      )}
      </div>
    </>
  );
}
