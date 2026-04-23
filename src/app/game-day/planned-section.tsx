"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RosterChips,
  type RosterAttendance,
  type RosterParticipant,
} from "./roster-chips";

export type MemberAttendance = RosterAttendance;

export type PlannedParticipant = RosterParticipant;

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

  async function setStatus(next: Exclude<MemberAttendance, "joker">) {
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

  const meIsJoker = me?.attendance === "joker";

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
                  : me.attendance === "joker"
                    ? "Joker"
                    : "Noch offen"}
            </Badge>
            <span className="text-[0.7rem] font-semibold text-primary-strong">
              {confirmed.length} / {participants.length} bestätigt
            </span>
          </div>
          {!meIsJoker && (
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
          )}
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

      <RosterChips participants={participants} />
    </div>
  );
}
