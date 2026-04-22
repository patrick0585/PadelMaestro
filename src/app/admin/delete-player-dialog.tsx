"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DeletePlayerDialog({
  open,
  onClose,
  playerId,
  playerName,
  playerEmail,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
  playerEmail: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function onConfirm() {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}`, { method: "DELETE" });
    setLoading(false);
    if (res.status === 204) {
      onClose();
      router.refresh();
      return;
    }
    if (res.status === 409 || res.status === 404) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Löschen nicht möglich");
      return;
    }
    setError("Löschen fehlgeschlagen");
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Spieler löschen — ${playerName ?? ""}`}>
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          {playerName}
          {playerEmail && <span className="ml-1 text-muted-foreground">({playerEmail})</span>} wird
          deaktiviert. Historische Matches und Spieltage bleiben erhalten.
        </p>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={loading}>
            Löschen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
