"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type HeroState =
  | { kind: "none" }
  | { kind: "not-member"; gameDayId: string; date: string; time: string; confirmed: number; total: number }
  | {
      kind: "member";
      gameDayId: string;
      date: string;
      time: string;
      confirmed: number;
      total: number;
      attendance: "pending" | "confirmed" | "declined";
    };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
}

export function DashboardHero({ state, isAdmin }: { state: HeroState; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (state.kind === "none") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Nächster Spieltag
        </div>
        <div className="mt-1 text-lg font-bold text-foreground">Noch kein Spieltag geplant</div>
        {isAdmin && (
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted"
          >
            Spieltag anlegen
          </Link>
        )}
      </div>
    );
  }

  const confirmedChip = (
    <span className="text-[0.7rem] font-semibold text-primary-strong">
      {state.confirmed} / {state.total} bestätigt
    </span>
  );

  async function join() {
    if (state.kind !== "not-member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function setStatus(next: "confirmed" | "declined" | "pending") {
    if (state.kind !== "member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <Badge variant="primary">Nächster Spieltag</Badge>
        <span className="text-[0.7rem] font-semibold text-primary-strong">{state.time}</span>
      </div>
      <div className="mt-2 text-xl font-extrabold text-foreground">{formatDate(state.date)}</div>
      <div className="mt-1">{confirmedChip}</div>
      {state.kind === "not-member" ? (
        <Button className="mt-3 w-full" disabled={busy} onClick={join}>
          Teilnehmen
        </Button>
      ) : state.attendance === "confirmed" ? (
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled>
            Dabei ✓
          </Button>
          <Button className="flex-1" variant="ghost" disabled={busy} onClick={() => setStatus("declined")}>
            Absagen
          </Button>
        </div>
      ) : (
        <Button className="mt-3 w-full" disabled={busy} onClick={() => setStatus("confirmed")}>
          Dabei sein
        </Button>
      )}
    </div>
  );
}
