"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateGameDayForm() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/game-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        className="rounded border px-3 py-2"
      />
      <button className="rounded bg-black px-4 py-2 text-white">Spieltag anlegen</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
