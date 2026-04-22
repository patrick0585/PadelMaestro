"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Props {
  gameDayId: string;
  dateLabel: string;
  status: "planned" | "roster_locked";
}

export function DeleteGameDayButton({ gameDayId, dateLabel, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const message =
    status === "roster_locked"
      ? `Spieltag ${dateLabel} löschen? Generierte Matches gehen verloren — Scores sind noch keine vorhanden.`
      : `Spieltag ${dateLabel} löschen?`;

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
