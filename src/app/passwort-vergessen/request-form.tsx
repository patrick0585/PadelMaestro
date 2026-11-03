"use client";
import { useState } from "react";
import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";
const ERRORS: Record<number, string> = {
  400: "Bitte eine gültige E-Mail-Adresse eingeben.",
  429: "Zu viele Versuche, bitte später.",
  503: "Mail konnte nicht gesendet werden, bitte später erneut versuchen.",
};

export function RequestForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus(
        res.status === 204
          ? { kind: "sent" }
          : { kind: "error", message: ERRORS[res.status] ?? GENERIC },
      );
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      {status.kind === "sent" ? (
        <InlineMessage kind="success">
          Wenn ein Konto mit bestätigter Adresse existiert, haben wir eine Mail geschickt.
        </InlineMessage>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="reset-email">E-Mail-Adresse</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
          <Button type="submit" loading={status.kind === "submitting"} className="w-full">
            Link anfordern
          </Button>
        </form>
      )}
      <Link
        href="/login"
        className="flex min-h-11 items-center justify-center rounded-xl text-sm text-foreground-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Zurück zur Anmeldung
      </Link>
    </div>
  );
}
