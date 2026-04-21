"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function JoinButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/join`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Konnte nicht beitreten");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button onClick={onClick} loading={loading}>
        Zum Spieltag beitreten
      </Button>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
