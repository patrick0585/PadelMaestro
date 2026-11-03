"use client";
import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";
const ERRORS: Record<number, string> = {
  400: "Bitte einen Namen mit 2 bis 40 Zeichen eingeben.",
  403: "Dafür brauchst du einen Gründer-Link.",
  429: "Zu viele Versuche, bitte später.",
};

export function GroupForm() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.status === 201) {
        window.location.assign("/admin?willkommen=1");
        return;
      }
      setStatus({ kind: "error", message: ERRORS[res.status] ?? GENERIC });
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <div>
        <Label htmlFor="group-name">Gruppenname</Label>
        <Input
          id="group-name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={40}
        />
        <p className="mt-1 text-xs text-foreground-muted">2 bis 40 Zeichen</p>
      </div>
      {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
      <Button type="submit" loading={status.kind === "submitting"} className="w-full">
        Gruppe gründen
      </Button>
    </form>
  );
}
