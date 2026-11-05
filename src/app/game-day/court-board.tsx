"use client";
import { useEffect, useId, useState } from "react";
import { canIncrement, hintFor, invalidReason, isSettledScore, type ScoringRule } from "@/lib/scoring/rule";
import { useScoreDraft, type EditableMatch } from "./score-editor";

export const AUTO_SAVE_MS = 2000;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function TeamHalf({
  names,
  value,
  mine,
  leading,
  canPlus,
  canMinus,
  readOnly,
  onPlus,
  onMinus,
}: {
  names: [string, string];
  value: number;
  mine: boolean;
  leading: boolean;
  canPlus: boolean;
  canMinus: boolean;
  readOnly: boolean;
  onPlus: () => void;
  onMinus: () => void;
}) {
  const team = names.join(" & ");
  return (
    <div
      className={`relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[20px] px-3.5 py-3 ${
        mine ? "border-[3px] border-primary bg-[#0b2230]" : "border-2 border-[#24324d] bg-[#0f1729]"
      }`}
    >
      {!readOnly && (
        <button
          type="button"
          aria-label={`Punkt für ${team} hinzufügen`}
          disabled={!canPlus}
          onClick={onPlus}
          className={`absolute inset-0 rounded-[18px] touch-manipulation active:bg-white/5 disabled:cursor-default ${FOCUS}`}
        />
      )}
      <div className="pointer-events-none min-w-0">
        {mine && (
          <span className="mb-1 inline-block rounded-full bg-primary px-2 font-display text-[11px] font-bold tracking-[0.14em] text-[#04202a]">
            DU
          </span>
        )}
        <p className="truncate text-[20px] font-extrabold leading-tight text-white">{names[0]}</p>
        <p className="truncate text-base text-[#dbe4f0]">{names[1]}</p>
        {!readOnly && (
          <p className="mt-1 font-display text-[12.5px] font-bold uppercase tracking-[0.14em] text-[#a7b4c8]">
            {canPlus ? "Tippen = +1" : leading ? "Sieg" : "\u00a0"}
          </p>
        )}
      </div>
      {readOnly ? (
        <span aria-hidden="true" />
      ) : (
        <button
          type="button"
          aria-label={`Punkt für ${team} entfernen`}
          disabled={!canMinus}
          onClick={onMinus}
          className={`relative z-10 grid size-14 place-items-center rounded-xl border-2 border-slate-600 bg-background text-[28px] font-bold text-white touch-manipulation disabled:opacity-40 ${FOCUS}`}
        >
          −
        </button>
      )}
      <span
        aria-hidden="true"
        className={`pointer-events-none min-w-[64px] text-right font-display text-[88px] font-extrabold leading-[0.85] tabular-nums ${
          leading ? "text-lime" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Dark scoreboard for the current match: tap a team to count, settled fixed-sum scores save themselves. */
export function CourtBoard({
  match,
  rule,
  myName,
  readOnly = false,
  onSaved,
}: {
  match: EditableMatch;
  rule: ScoringRule;
  myName: string | null;
  readOnly?: boolean;
  onSaved?: (score: [number, number]) => void;
}) {
  const hintId = useId();
  const { t1, t2, setT1, setT2, dirty, busy, error, save } = useScoreDraft(match, onSaved);
  // Set when the player stops the countdown; any further edit re-arms it.
  const [held, setHeld] = useState(false);

  const reason = invalidReason(rule, t1, t2);
  const valid = reason === null;
  // A failed save waits for the next edit instead of retrying every few seconds.
  const counting = !readOnly && dirty && !busy && !held && error === null && isSettledScore(rule, t1, t2);
  const locked = counting || busy;

  useEffect(() => {
    if (!counting) return;
    const t = setTimeout(save, AUTO_SAVE_MS);
    return () => clearTimeout(t);
    // save is recreated each render; the countdown restarts only when the score does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, t1, t2]);

  const change = (setter: (n: number) => void) => (n: number) => {
    setHeld(false);
    setter(n);
  };

  const mine1 = myName !== null && match.team1.includes(myName);
  const mine2 = myName !== null && match.team2.includes(myName);
  // While a side can still count up the score is just incomplete, not wrong.
  const incomplete = !valid && (canIncrement(rule, t1, t2) || canIncrement(rule, t2, t1));
  const neutral = valid || incomplete;
  const hint = neutral ? hintFor(rule) : reason;

  return (
    <div>
      <div role="group" aria-label={`Ergebnis Match ${match.matchNumber}`} aria-describedby={hintId} className="space-y-2.5">
        <TeamHalf
          names={match.team1}
          value={t1}
          mine={mine1}
          leading={valid && t1 > t2}
          canPlus={!locked && canIncrement(rule, t1, t2)}
          canMinus={!locked && t1 > 0}
          readOnly={readOnly}
          onPlus={() => change(setT1)(t1 + 1)}
          onMinus={() => change(setT1)(t1 - 1)}
        />
        <TeamHalf
          names={match.team2}
          value={t2}
          mine={mine2}
          leading={valid && t2 > t1}
          canPlus={!locked && canIncrement(rule, t2, t1)}
          canMinus={!locked && t2 > 0}
          readOnly={readOnly}
          onPlus={() => change(setT2)(t2 + 1)}
          onMinus={() => change(setT2)(t2 - 1)}
        />
      </div>
      <p
        id={hintId}
        aria-live="polite"
        className={`mt-2.5 text-center text-[15px] font-semibold ${neutral ? "text-white" : "text-amber-300"}`}
      >
        <span className="sr-only">
          Stand {t1}:{t2}.{" "}
        </span>
        {readOnly ? "Ergebnis tragen die Spieler ein" : counting ? "Ergebnis gültig" : hint}
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-black/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {!readOnly && valid && dirty && (
        <div className="mt-2.5">
          {counting ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button
                type="button"
                onClick={save}
                data-testid="court-save"
                className={`flex min-h-[52px] items-center justify-center gap-2.5 rounded-[14px] bg-lime text-base font-extrabold text-background ${FOCUS}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 -rotate-90">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="court-countdown"
                    style={{ animationDuration: `${AUTO_SAVE_MS}ms` }}
                  />
                </svg>
                Speichert {t1}:{t2}
              </button>
              <button
                type="button"
                onClick={() => setHeld(true)}
                className={`min-h-[52px] rounded-[14px] border-2 border-slate-600 bg-background px-5 font-bold text-white ${FOCUS}`}
              >
                Stopp
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              data-testid="court-save"
              className={`min-h-[52px] w-full rounded-[14px] bg-lime text-base font-extrabold text-background disabled:opacity-70 ${FOCUS}`}
            >
              {busy ? "Speichert…" : `Speichern · ${t1}:${t2}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
