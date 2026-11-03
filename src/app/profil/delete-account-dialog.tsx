"use client";
import { useEffect, useId, useState } from "react";
import { signOut } from "next-auth/react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";

const FALLBACK = "Löschen fehlgeschlagen.";

type ErrorBody = { error?: string; groups?: { id: string; name: string }[] };

function errorText(status: number, body: ErrorBody): string {
  if (status === 403 && body.error === "wrong_password") return "Passwort falsch.";
  if (status === 409 && body.error === "owner_of_group") {
    const names = (body.groups ?? []).map((g) => g.name).join(", ");
    return `Du bist Besitzer von: ${names}. Übertrage den Besitz oder lösche die Gruppe zuerst.`;
  }
  if (status === 429) return "Zu viele Versuche, bitte später.";
  return FALLBACK;
}

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordInvalid, setPasswordInvalid] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      setPasswordInvalid(false);
      setLoading(false);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/profile", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setLoading(false);
      setError(FALLBACK);
      return;
    }
    if (res.status === 204) {
      await signOut({ callbackUrl: "/login" });
      return;
    }
    setLoading(false);
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    setError(errorText(res.status, body));
    setPasswordInvalid(res.status === 403 && body.error === "wrong_password");
  }

  return (
    <Dialog open={open} onClose={loading ? () => {} : onClose} title="Konto löschen">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm font-semibold text-foreground">
          Das kann nicht rückgängig gemacht werden.
        </p>
        <p className="text-sm text-foreground">
          Du wirst aus allen Gruppen entfernt und abgemeldet. Deine Spielergebnisse bleiben ohne
          deinen Namen erhalten.
        </p>
        <div className="space-y-1">
          <Label htmlFor={passwordId}>Dein Passwort</Label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordInvalid(false);
            }}
            autoComplete="current-password"
            aria-invalid={passwordInvalid || undefined}
          />
        </div>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} autoFocus>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="destructive"
            loading={loading}
            disabled={password.length === 0}
          >
            Endgültig löschen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
