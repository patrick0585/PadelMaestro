"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, Star, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TICKET_HEAD, TICKET_PILL } from "@/components/home/styles";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";
import {
  ATTENDANCE_ERROR_MESSAGES,
  genericAttendanceError,
  genericJokerError,
  type AttendanceErrorCode,
} from "@/lib/game-day/attendance-errors";

export interface HeroPip {
  playerId: string;
  name: string;
  avatarVersion: number;
}

interface HeroBase {
  gameDayId: string;
  weekday: string;
  dateShort: string;
  startTime: string | null;
  countdown: string;
  confirmed: number;
  pending: number;
  total: number;
  pips: HeroPip[];
}

export type HeroState =
  | ({ kind: "not-member" } & HeroBase)
  | ({
      kind: "member";
      attendance: "pending" | "confirmed" | "declined" | "joker";
      jokersRemaining: number;
      jokersTotal: number;
      jokerGamesCredited: number;
      ppgSnapshot: number | null;
    } & HeroBase);

const STATUS: Record<"pending" | "confirmed" | "declined" | "joker", { label: string; cls: string }> = {
  pending: { label: "noch offen", cls: "border-amber-400/40 bg-amber-400/15 text-amber-200" },
  confirmed: { label: "zugesagt", cls: "border-lime/60 bg-black/35 text-lime" },
  declined: { label: "abgesagt", cls: "border-white/25 bg-black/20 text-[#d9f6fb]" },
  joker: { label: "Joker gesetzt", cls: "border-amber-400/40 bg-amber-400/15 text-amber-200" },
};

const MAX_PIPS = 8;
const ACT =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-[14.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50";
const IDLE = "border-white/30 bg-black/25 text-white hover:bg-black/35";
const GO = "border-lime bg-lime font-bold text-background";
const PRESSED_GO = "border-lime bg-lime font-bold text-background ring-2 ring-white/70";

type JokerErrorCode = "JOKER_LOCKED" | "JOKER_CAP_EXCEEDED" | "JOKER_NOT_FOUND";
const JOKER_ERROR_MESSAGES: Record<JokerErrorCode, string> = {
  JOKER_LOCKED: "Spieltag ist bereits gestartet — Änderungen nicht mehr möglich.",
  JOKER_CAP_EXCEEDED: "Für diese Saison sind keine Joker mehr verfügbar.",
  JOKER_NOT_FOUND: "Joker war nicht gesetzt.",
};

async function readErrorCode(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  return body?.code ?? null;
}

export function DashboardHero({ state }: { state: HeroState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (state.kind !== "not-member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function postAttendance(next: "confirmed" | "declined" | "pending"): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(`/api/game-days/${state.gameDayId}/attendance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    } catch {
      setError(genericAttendanceError(0));
      return false;
    }
    if (res.ok) return true;
    const code = await readErrorCode(res);
    if (code && code in ATTENDANCE_ERROR_MESSAGES) {
      setError(ATTENDANCE_ERROR_MESSAGES[code as AttendanceErrorCode]);
    } else {
      setError(genericAttendanceError(res.status));
    }
    return false;
  }

  async function deleteJoker(): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/jokers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameDayId: state.gameDayId }),
      });
    } catch {
      setError(genericJokerError(0));
      return false;
    }
    if (res.ok) return true;
    const code = await readErrorCode(res);
    if (code && code in JOKER_ERROR_MESSAGES) {
      setError(JOKER_ERROR_MESSAGES[code as JokerErrorCode]);
      if (code === "JOKER_CAP_EXCEEDED") router.refresh();
    } else {
      setError(genericJokerError(res.status));
    }
    return false;
  }

  async function postJoker(): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch("/api/jokers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameDayId: state.gameDayId }),
      });
    } catch {
      setError(genericJokerError(0));
      return false;
    }
    if (res.ok) return true;
    const code = await readErrorCode(res);
    if (code && code in JOKER_ERROR_MESSAGES) {
      setError(JOKER_ERROR_MESSAGES[code as JokerErrorCode]);
      if (code === "JOKER_CAP_EXCEEDED") router.refresh();
    } else {
      setError(genericJokerError(res.status));
    }
    return false;
  }

  async function handleChoose(next: "confirmed" | "declined") {
    if (state.kind !== "member") return;
    setBusy(true);
    setError(null);
    if (state.attendance === "joker") {
      const cleared = await deleteJoker();
      if (!cleared) {
        setBusy(false);
        return;
      }
    }
    const ok = await postAttendance(next);
    setBusy(false);
    if (ok) router.refresh();
  }

  async function handleConfirmJoker() {
    if (state.kind !== "member") return;
    setBusy(true);
    setError(null);
    const ok = await postJoker();
    setBusy(false);
    setDialogOpen(false);
    if (ok) router.refresh();
  }

  const shownPips = state.pips.slice(0, MAX_PIPS);
  const ghostCount = Math.min(state.pending, MAX_PIPS - shownPips.length);
  const overflow = state.pips.length - shownPips.length + (state.pending - ghostCount);

  return (
    <section aria-label="Nächster Spieltag" className="ticket">
      <div className={TICKET_HEAD}>
        <span>Nächster Spieltag</span>
        {state.startTime && (
          <span className={TICKET_PILL}>
            {state.countdown}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="font-display font-extrabold text-white">
          <span className="mb-1.5 block text-[22px] uppercase leading-none tracking-[0.2em] text-lime">
            {state.weekday}
          </span>
          <span className="block text-[88px] leading-[0.85] tabular-nums">{state.dateShort}</span>
        </div>
        {state.startTime ? (
          <div className="text-right font-display text-[44px] font-bold leading-none text-white">
            <span className="mb-1 flex items-center justify-end gap-1 font-sans text-[13px] font-semibold tracking-[0.04em] text-[#d9f6fb]">
              <Clock aria-hidden="true" className="size-3.5" /> Anpfiff
            </span>
            <span className="tabular-nums">{state.startTime}</span>
          </div>
        ) : (
          <div className="text-right font-display text-[40px] font-bold uppercase leading-none text-white">
            {state.countdown}
          </div>
        )}
      </div>

      <div className="ticket-perf" aria-hidden="true" />

      <div className="flex flex-wrap items-center gap-[7px]" aria-hidden="true">
        {shownPips.map((p) => (
          <Avatar
            key={p.playerId}
            playerId={p.playerId}
            name={p.name}
            avatarVersion={p.avatarVersion}
            size={32}
            className="ring-2 ring-[#0f5560]"
          />
        ))}
        {Array.from({ length: ghostCount }, (_, i) => (
          <span
            key={`ghost-${i}`}
            className="inline-flex size-8 items-center justify-center rounded-full border-[1.5px] border-dashed border-white/50 text-xs font-bold text-white/60"
          >
            ?
          </span>
        ))}
        {overflow > 0 && <span className="text-sm font-semibold text-[#d9f6fb]">+{overflow}</span>}
      </div>
      <p className="mt-2.5 text-sm text-[#d9f6fb]">
        <b className="text-white">
          {state.confirmed} von {state.total}
        </b>{" "}
        zugesagt{state.pending > 0 ? ` · ${state.pending} offen` : ""}
      </p>

      {state.kind === "not-member" ? (
        <button type="button" className={`${ACT} ${GO} mt-3 w-full`} disabled={busy} onClick={join}>
          Teilnehmen
        </button>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2 text-[13.5px] text-[#d9f6fb]">
            Dein Status
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[12.5px] font-semibold ${STATUS[state.attendance].cls}`}
            >
              {STATUS[state.attendance].label}
            </span>
          </p>
          <div className="mt-3 grid grid-cols-[1.3fr_1fr_1fr] gap-2">
            <button
              type="button"
              aria-pressed={state.attendance === "confirmed"}
              disabled={busy}
              onClick={() => handleChoose("confirmed")}
              className={`${ACT} ${state.attendance === "pending" ? GO : state.attendance === "confirmed" ? PRESSED_GO : IDLE}`}
            >
              <Check aria-hidden="true" className="size-4" /> Zusagen
            </button>
            <button
              type="button"
              aria-pressed={state.attendance === "declined"}
              disabled={busy}
              onClick={() => handleChoose("declined")}
              className={`${ACT} ${state.attendance === "declined" ? "border-white bg-white/90 text-background" : IDLE}`}
            >
              <X aria-hidden="true" className="size-4" /> Absagen
            </button>
            <button
              type="button"
              aria-pressed={state.attendance === "joker"}
              disabled={busy || state.jokersRemaining === 0 || state.attendance === "joker"}
              onClick={() => setDialogOpen(true)}
              className={`${ACT} ${state.attendance === "joker" ? "border-amber-300 bg-amber-300 text-background ring-2 ring-white/70 disabled:opacity-100" : `${IDLE} text-amber-200`}`}
            >
              <Star aria-hidden="true" className="size-4" /> Joker
            </button>
          </div>
          {state.jokersRemaining === 0 && (
            <p className="mt-2 text-xs text-[#d9f6fb]">Keine Joker mehr in dieser Saison</p>
          )}
          {error && (
            <p role="alert" className="mt-2 rounded-xl bg-black/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          <JokerConfirmDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onConfirm={handleConfirmJoker}
            jokersRemaining={state.jokersRemaining}
            jokersTotal={state.jokersTotal}
            gamesCredited={state.jokerGamesCredited}
            ppgSnapshot={state.ppgSnapshot}
            loading={busy}
          />
        </>
      )}
    </section>
  );
}
