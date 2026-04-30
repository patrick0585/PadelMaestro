"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";

export function ShufflePreviewButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function shuffle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/game-days/${gameDayId}/shuffle-preview`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Konnte die Reihenfolge nicht mischen.");
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
        onClick={shuffle}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
      >
        <Shuffle className="h-4 w-4" aria-hidden />
        {busy ? "Mische…" : "Reihenfolge mischen"}
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
