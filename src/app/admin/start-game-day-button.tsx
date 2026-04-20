"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.push("/game-day");
  }

  return (
    <>
      <button
        onClick={click}
        disabled={loading}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white"
      >
        {loading ? "..." : "Spieltag starten"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
