"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const ERROR_COPY: Record<string, string> = {
  too_few_players: "Es müssen mindestens 4 Spieler bestätigt sein.",
  too_many_players: "Es dürfen höchstens 6 Spieler bestätigt sein.",
  already_started: "Spieltag wurde bereits gestartet.",
};

export function StartGameDayButton({
  gameDayId,
  confirmedCount,
}: {
  gameDayId: string;
  confirmedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (
      !window.confirm(
        `Spielbetrieb mit ${confirmedCount} Spielern starten? Die Paarungen werden festgeschrieben.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const code = body?.error;
        setError((code && ERROR_COPY[code]) ?? "Konnte den Spieltag nicht starten.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full rounded-xl bg-[image:var(--cta-gradient)] px-4 py-3 text-sm font-extrabold text-background shadow disabled:opacity-40"
      >
        {busy ? "Starte…" : "Spielbetrieb starten"}
      </button>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
