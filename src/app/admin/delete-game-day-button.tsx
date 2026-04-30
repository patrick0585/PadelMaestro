"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Props {
  gameDayId: string;
  dateLabel: string;
}

export function DeleteGameDayButton({ gameDayId, dateLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function onConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Löschen fehlgeschlagen");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  // Only planned days can be deleted now — once Spielbetrieb starts,
  // the day moves to in_progress and the admin must finish it instead.
  const message = `Spieltag ${dateLabel} löschen?`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Spieltag ${dateLabel} löschen`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Spieltag löschen">
        <p className="text-sm text-foreground">{message}</p>
        {error && (
          <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={loading}>
            Löschen
          </Button>
        </div>
      </Dialog>
    </>
  );
}
