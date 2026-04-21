"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type MemberAttendance = "pending" | "confirmed" | "declined";

export interface PlannedParticipant {
  playerId: string;
  name: string;
  attendance: MemberAttendance;
}

export function PlannedSection({
  gameDayId,
  me,
  participants,
}: {
  gameDayId: string;
  me: PlannedParticipant | null;
  participants: PlannedParticipant[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = participants.filter((p) => p.attendance === "confirmed");
  const pending = participants.filter((p) => p.attendance === "pending");
  const declined = participants.filter((p) => p.attendance === "declined");

  async function setStatus(next: MemberAttendance) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte Status nicht speichern");
      return;
    }
    router.refresh();
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte dich nicht hinzufügen");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {me ? (
        <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-4">
          <div className="flex items-center justify-between">
            <Badge variant={me.attendance === "confirmed" ? "lime" : "primary"}>
              {me.attendance === "confirmed"
                ? "Dabei ✓"
                : me.attendance === "declined"
                  ? "Abgesagt"
                  : "Noch offen"}
            </Badge>
            <span className="text-[0.7rem] font-semibold text-primary-strong">
              {confirmed.length} / {participants.length} bestätigt
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={me.attendance === "confirmed" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("confirmed")}>
              Dabei
            </Button>
            <Button size="sm" variant={me.attendance === "declined" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("declined")}>
              Nicht dabei
            </Button>
            <Button size="sm" variant={me.attendance === "pending" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("pending")}>
              Weiß nicht
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Du bist noch nicht dabei</div>
          <p className="mt-1 text-sm text-foreground-muted">
            Du bist kein Teilnehmer dieses Spieltags. Trete bei, um mitzuspielen.
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={join}>
            Teilnehmen
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <ChipRow title="Dabei" count={confirmed.length} names={confirmed.map((p) => p.name)} tone="lime" />
        <ChipRow title="Offen" count={pending.length} names={pending.map((p) => p.name)} tone="primary" />
        <ChipRow title="Abgesagt" count={declined.length} names={declined.map((p) => p.name)} tone="soft" />
      </div>
    </div>
  );
}

function ChipRow({
  title,
  count,
  names,
  tone,
}: {
  title: string;
  count: number;
  names: string[];
  tone: "lime" | "primary" | "soft";
}) {
  return (
    <div>
      <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {title} · {count}
      </div>
      {names.length === 0 ? (
        <div className="text-xs text-foreground-dim">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <span
              key={n}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                tone === "lime"
                  ? "bg-success-soft text-success border border-success/40"
                  : tone === "primary"
                    ? "bg-primary-soft text-primary border border-primary/30"
                    : "bg-surface-muted text-foreground-muted"
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
