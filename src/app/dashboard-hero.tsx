"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";
import {
  ATTENDANCE_ERROR_MESSAGES,
  genericAttendanceError,
  genericJokerError,
  type AttendanceErrorCode,
} from "@/lib/game-day/attendance-errors";

export type HeroState =
  | {
      kind: "not-member";
      gameDayId: string;
      date: string;
      confirmed: number;
      total: number;
    }
  | {
      kind: "member";
      gameDayId: string;
      date: string;
      confirmed: number;
      total: number;
      attendance: "pending" | "confirmed" | "declined" | "joker";
      jokersRemaining: number;
      ppgSnapshot: number | null;
    };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

type JokerErrorCode = "JOKER_LOCKED" | "JOKER_CAP_EXCEEDED" | "JOKER_NOT_FOUND";
const JOKER_ERROR_MESSAGES: Record<JokerErrorCode, string> = {
  JOKER_LOCKED: "Spieltag ist bereits gestartet — Änderungen nicht mehr möglich.",
  JOKER_CAP_EXCEEDED: "Du hast deine 2 Joker dieser Saison bereits verbraucht.",
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

  return (
    <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center">
        <Badge variant="primary">Nächster Spieltag</Badge>
      </div>
      <div className="mt-2 text-xl font-extrabold text-foreground">{formatDate(state.date)}</div>
      <div className="mt-1">
        <span className="text-[0.7rem] font-semibold text-primary-strong">
          {state.confirmed} / {state.total} bestätigt
        </span>
      </div>
      {state.kind === "not-member" ? (
        <Button className="mt-3 w-full" disabled={busy} onClick={join}>
          Teilnehmen
        </Button>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              variant={state.attendance === "confirmed" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "confirmed"}
              disabled={busy}
              onClick={() => handleChoose("confirmed")}
            >
              Dabei sein
            </Button>
            <Button
              variant={state.attendance === "declined" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "declined"}
              disabled={busy}
              onClick={() => handleChoose("declined")}
            >
              Nicht dabei
            </Button>
            <Button
              variant={state.attendance === "joker" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "joker"}
              disabled={busy || state.jokersRemaining === 0 || state.attendance === "joker"}
              onClick={() => setDialogOpen(true)}
            >
              Joker setzen
            </Button>
          </div>
          {state.jokersRemaining === 0 && (
            <p className="mt-2 text-xs text-foreground-muted">
              Keine Joker mehr in dieser Saison
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <JokerConfirmDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onConfirm={handleConfirmJoker}
            jokersRemaining={state.jokersRemaining}
            ppgSnapshot={state.ppgSnapshot}
            loading={busy}
          />
        </>
      )}
    </div>
  );
}
