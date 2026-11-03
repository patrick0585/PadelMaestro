"use client";
import { useState } from "react";
import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setStatus({ kind: "error", message: "Die Passwörter stimmen nicht überein." });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.status === 204) {
        setStatus({ kind: "success" });
        return;
      }
      let message = GENERIC;
      if (res.status === 429) message = "Zu viele Versuche, bitte später.";
      else if (res.status === 400) {
        const body = await res.json().catch(() => null);
        if (body?.error === "invalid_token") message = "Dieser Link ist ungültig oder abgelaufen.";
        else if (body?.error === "invalid") message = "Neues Passwort muss mindestens 8 Zeichen haben.";
      }
      setStatus({ kind: "error", message });
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
        <InlineMessage kind="success">Passwort geändert</InlineMessage>
        <Link
          href="/login"
          className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <div>
        <Label htmlFor="new-password">Neues Passwort (min. 8 Zeichen)</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
      <Button type="submit" loading={status.kind === "submitting"} className="w-full">
        Passwort ändern
      </Button>
    </form>
  );
}
