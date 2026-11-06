"use client";
import { useEffect, useState } from "react";
import type { EditableMatch } from "./score-editor";
import { CourtBoard } from "./court-board";
import { requestOpenMatch } from "./match-rows";
import type { ScoringRule } from "@/lib/scoring/rule";

const TOAST_MS = 8000;

type Segment = "done" | "current" | "open";

export interface NextUp {
  matchNumber: number;
  team1: [string, string];
  team2: [string, string];
  /** "plays" if the viewer is in this match, "pauses" if they play today but not here. */
  you: "plays" | "pauses" | null;
}

const pair = (t: [string, string]) => t.join(" & ");

function NextCard({ next }: { next: NextUp }) {
  const label =
    next.you === "plays" ? (
      <>
        <b className="text-primary">Du spielst als Nächstes</b> · Match {next.matchNumber}
      </>
    ) : (
      <>
        Als Nächstes · Match {next.matchNumber}
        {next.you === "pauses" && " · du pausierst"}
      </>
    );
  return (
    <div
      data-testid="next-match"
      data-match-number={next.matchNumber}
      className={`mt-3 rounded-2xl bg-[#0f1729] px-3.5 py-2.5 ${next.you === "plays" ? "border-2 border-primary" : "border border-border"}`}
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.14em] text-[#a7b4c8]">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-white">
        {pair(next.team1)} <span className="font-normal text-[#a7b4c8]">gegen</span> {pair(next.team2)}
      </p>
    </div>
  );
}

const SEG: Record<Segment, string> = {
  done: "bg-lime",
  current: "bg-white anim-pulse",
  open: "bg-[#1f2a40]",
};

export function CurrentMatch({
  current,
  segments,
  rule,
  canEdit,
  myName,
  next,
}: {
  current: EditableMatch | null;
  segments: Segment[];
  rule: ScoringRule;
  canEdit: boolean;
  myName: string | null;
  next: NextUp | null;
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
      <section aria-label="Laufendes Match" data-testid="current-match" data-match-number={current?.matchNumber}>
        <div className="flex items-center justify-between font-display text-sm font-bold uppercase tracking-[0.14em] text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs tracking-[0.12em]">
            <i aria-hidden="true" className="anim-pulse size-[7px] rounded-full bg-white" />
            Live
          </span>
          <span>{progress}</span>
        </div>
        {total > 0 && (
          <div className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
            {segments.map((s, i) => (
              <i key={i} className={`h-[7px] rounded-sm ${SEG[s]}`} />
            ))}
          </div>
        )}
        {current ? (
          <div className="mt-2.5">
            <CourtBoard
              key={current.id}
              match={current}
              rule={rule}
              myName={myName}
              readOnly={!canEdit}
              onSaved={(score) =>
                setSaved({
                  id: current.id,
                  number: current.matchNumber,
                  score,
                  winner: pair(score[0] > score[1] ? current.team1 : current.team2),
                })
              }
            />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-border bg-[#0f1729] p-4 text-[15px] text-white">Alle Ergebnisse sind eingetragen.</p>
        )}
        {next && <NextCard next={next} />}
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
