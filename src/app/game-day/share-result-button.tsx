"use client";
import { useState } from "react";
import { Share } from "lucide-react";
import { shareImage } from "@/lib/share/share-client";

export function ShareResultButton({ gameDayId, fileName }: { gameDayId: string; fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onShare() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/game-days/${gameDayId}/share-image`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await shareImage(await res.blob(), fileName, "Spieltag-Ergebnis");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        aria-busy={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-background transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
      >
        <Share aria-hidden="true" className="size-4" />
        {busy ? "Bild wird erstellt…" : "Ergebnis teilen"}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          Bild konnte nicht erstellt werden. Bitte erneut versuchen.
        </p>
      )}
    </div>
  );
}
