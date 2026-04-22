"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddExtraMatchButton } from "./add-extra-match-button";

export function FinishBanner({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game-days/${gameDayId}/finish`, { method: "POST" });
      if (!res.ok) {
        setError("Abschließen fehlgeschlagen");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div role="status" className="rounded-2xl border border-primary/40 bg-primary-soft p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-foreground">Alle Matches gewertet.</div>
        <div className="text-sm text-foreground-muted">
          Spieltag abschließen oder noch ein Zusatz-Match einplanen?
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onFinish} loading={loading} size="sm">
          Spieltag abschließen
        </Button>
        <AddExtraMatchButton gameDayId={gameDayId} label="Zusatz-Match hinzufügen" />
      </div>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
