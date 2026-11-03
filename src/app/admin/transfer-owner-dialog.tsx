"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

const ERRORS: Record<number, string> = {
  403: "Nur der Besitzer kann den Besitz übertragen.",
  404: "Spieler nicht gefunden.",
  409: "Du kannst den Besitz nicht an dich selbst übertragen.",
};
const FALLBACK = "Übertragen fehlgeschlagen.";

export function TransferOwnerDialog({
  open,
  onClose,
  player,
}: {
  open: boolean;
  onClose: () => void;
  player: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
    }
  }, [open]);

  async function onConfirm() {
    if (!player) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/groups/active/transfer-owner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      setLoading(false);
      setError(FALLBACK);
      return;
    }
    if (controller.signal.aborted) return;
    setLoading(false);
    if (res.status === 204) {
      onClose();
      router.refresh();
      return;
    }
    setError(ERRORS[res.status] ?? FALLBACK);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Besitz übertragen">
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          <strong>{player?.name}</strong> wird Besitzer der Gruppe. Du wirst Admin. Das kannst nur{" "}
          <strong>{player?.name}</strong> wieder rückgängig machen.
        </p>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} autoFocus>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={loading}>
            Besitz an {player?.name} übertragen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
