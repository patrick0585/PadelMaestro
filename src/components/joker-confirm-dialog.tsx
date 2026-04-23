"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface JokerConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  jokersRemaining: number;
  ppgSnapshot: number | null;
  loading?: boolean;
  targetName?: string;
}

function formatDe(value: number, digits: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function JokerConfirmDialog({
  open,
  onClose,
  onConfirm,
  jokersRemaining,
  ppgSnapshot,
  loading = false,
  targetName,
}: JokerConfirmDialogProps) {
  const nth = 2 - jokersRemaining + 1;
  const title = targetName ? `Joker für ${targetName} setzen?` : "Joker einsetzen?";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-3 text-sm text-foreground">
        <p>
          {targetName ? `${targetName} setzt` : "Du setzt"} den{" "}
          <strong>{nth}. von 2 Jokern</strong> ein.
        </p>
        {ppgSnapshot !== null ? (
          <p>
            Aktuelle PPG: <strong>{formatDe(ppgSnapshot, 2)}</strong> → du bekommst{" "}
            <strong>
              10 × {formatDe(ppgSnapshot, 2)} ≈ {Math.round(ppgSnapshot * 10)} Punkte
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
