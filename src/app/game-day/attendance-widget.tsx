"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AttendanceWidget({
  gameDayId,
  current,
}: {
  gameDayId: string;
  current: "pending" | "confirmed" | "declined" | "joker";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(status: "confirmed" | "declined") {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => set("confirmed")}
          disabled={loading || current === "confirmed"}
          className={`rounded border px-3 py-1 ${current === "confirmed" ? "bg-green-100" : ""}`}
        >
          Ich komme
        </button>
        <button
          onClick={() => set("declined")}
          disabled={loading || current === "declined"}
          className={`rounded border px-3 py-1 ${current === "declined" ? "bg-red-100" : ""}`}
        >
          Nein
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
