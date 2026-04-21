"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Attendance = "pending" | "confirmed" | "declined";

const OPTIONS: Array<{ value: Attendance; label: string }> = [
  { value: "confirmed", label: "Dabei" },
  { value: "declined", label: "Nicht dabei" },
  { value: "pending", label: "Weiß nicht" },
];

export function AttendanceWidget({
  gameDayId,
  current,
}: {
  gameDayId: string;
  current: Attendance;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Attendance>(current);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: Attendance) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Konnte Status nicht speichern");
      return;
    }
    setValue(next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            type="button"
            variant={value === o.value ? "primary" : "secondary"}
            size="sm"
            disabled={loading}
            onClick={() => set(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
