"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDe } from "@/lib/format";

export interface JokerConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  jokersRemaining: number;
  jokersTotal: number;
  gamesCredited: number;
  ppgSnapshot: number | null;
  loading?: boolean;
  targetName?: string;
}

export function JokerConfirmDialog({
  open,
  onClose,
  onConfirm,
  jokersRemaining,
  jokersTotal,
  gamesCredited,
  ppgSnapshot,
  loading = false,
  targetName,
}: JokerConfirmDialogProps) {
  const nth = jokersTotal - jokersRemaining + 1;
  const title = targetName ? `Joker für ${targetName} setzen?` : "Joker einsetzen?";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-3 text-sm text-foreground">
        <p>
          {targetName ? `${targetName} setzt` : "Du setzt"} den{" "}
          <strong>{jokersTotal === 1 ? "deinen einzigen Joker" : `${nth}. von ${jokersTotal} Jokern`}</strong> ein.
        </p>
        {ppgSnapshot !== null ? (
          <p>
            Aktuelle PPG: <strong>{formatDe(ppgSnapshot, 2)}</strong> → du bekommst{" "}
            <strong>
              {gamesCredited} × {formatDe(ppgSnapshot, 2)} ≈{" "}
              {Math.round(ppgSnapshot * gamesCredited)} Punkte
            </strong>{" "}
            gutgeschrieben.
          </p>
        ) : (
          <p>Bisher keine Statistik — die PPG wird beim Setzen des Jokers festgeschrieben.</p>
        )}
        <p className="text-foreground-muted">
          Der Joker kann bis zum Beginn des Spieltags wieder entfernt werden.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} loading={loading}>
            Joker setzen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
