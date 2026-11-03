"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { InlineMessage } from "@/components/ui/inline-message";

const FALLBACK = "Löschen fehlgeschlagen.";

function errorText(status: number, code: string | undefined): string {
  if (status === 400 && code === "name_mismatch") return "Der Name stimmt nicht.";
  if (status === 403 && code === "wrong_password") return "Passwort falsch.";
  if (status === 403) return "Nur der Besitzer kann die Gruppe löschen.";
  if (status === 429) return "Zu viele Versuche, bitte später.";
  return FALLBACK;
}

export function DeleteGroupDialog({
  open,
  onClose,
  name,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
}) {
  const nameId = useId();
  const passwordId = useId();
  const [typedName, setTypedName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setTypedName("");
      setPassword("");
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      setLoading(false);
    }
  }, [open]);

  const canConfirm = typedName === name && password.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/groups/active", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: typedName, password }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      setLoading(false);
      setError(FALLBACK);
      return;
    }
    if (controller.signal.aborted) return;
    if (res.status === 204) {
      window.location.assign("/");
      return;
    }
    setLoading(false);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(errorText(res.status, body.error));
  }

  return (
    <Dialog open={open} onClose={onClose} title="Gruppe löschen">
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-foreground">
          Das löscht alle Spieltage, Ergebnisse und Einladungen von <strong>{name}</strong>. Die
          Konten der Mitglieder bleiben.
        </p>
        <div className="space-y-1">
          <Label htmlFor={nameId}>Gruppenname zur Bestätigung</Label>
          <Input
            id={nameId}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={passwordId}>Dein Passwort</Label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} autoFocus>
            Abbrechen
          </Button>
          <Button type="submit" variant="destructive" loading={loading} disabled={!canConfirm}>
            Endgültig löschen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
