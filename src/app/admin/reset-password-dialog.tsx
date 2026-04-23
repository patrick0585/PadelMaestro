"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordDialog({
  open,
  onClose,
  playerId,
  playerName,
  hasPassword = true,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
  hasPassword?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}/password`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Zurücksetzen fehlgeschlagen");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${hasPassword ? "Passwort zurücksetzen" : "Passwort setzen"} — ${playerName ?? ""}`}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="reset-password">
            {hasPassword ? "Neues Passwort (min. 8 Zeichen)" : "Passwort (min. 8 Zeichen)"}
          </Label>
          <Input
            id="reset-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Zurücksetzen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
