"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ParticipantAttendance = "pending" | "confirmed" | "declined";

export interface ParticipantRow {
  playerId: string;
  name: string;
  attendance: ParticipantAttendance;
}

const OPTIONS: Array<{ value: ParticipantAttendance; label: string }> = [
  { value: "confirmed", label: "Dabei" },
  { value: "declined", label: "Nicht dabei" },
  { value: "pending", label: "Ausstehend" },
];

const STATUS_LABEL: Record<ParticipantAttendance, string> = {
  pending: "Ausstehend",
  confirmed: "Dabei",
  declined: "Nicht dabei",
};

export function ParticipantsSection({
  gameDayId,
  participants,
}: {
  gameDayId: string;
  participants: ParticipantRow[];
}) {
  const router = useRouter();
  const [local, setLocal] = useState(participants);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function set(playerId: string, status: ParticipantAttendance) {
    setPendingId(playerId);
    setError(null);
    const previous = local;
    setLocal((rows) =>
      rows.map((r) => (r.playerId === playerId ? { ...r, attendance: status } : r)),
    );
    const res = await fetch(
      `/api/game-days/${gameDayId}/participants/${playerId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    setPendingId(null);
    if (!res.ok) {
      setLocal(previous);
      setError("Konnte Status nicht speichern");
      return;
    }
    router.refresh();
  }

  const confirmedCount = local.filter((p) => p.attendance === "confirmed").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Teilnehmer</span>
        <span>{confirmedCount} bestätigt</span>
      </div>
      <ul className="space-y-2">
        {local.map((p) => (
          <li
            key={p.playerId}
            className="rounded-xl border border-border p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{p.name}</span>
              <Badge
                variant={
                  p.attendance === "confirmed"
                    ? "primary"
                    : p.attendance === "declined"
                      ? "neutral"
                      : "neutral"
                }
              >
                {STATUS_LABEL[p.attendance]}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  variant={p.attendance === o.value ? "primary" : "secondary"}
                  size="sm"
                  disabled={pendingId !== null}
                  onClick={() => set(p.playerId, o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
