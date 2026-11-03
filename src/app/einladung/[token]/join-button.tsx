"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status = { kind: "idle" } | { kind: "submitting" } | { kind: "error"; message: string };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";
const ERRORS: Record<number, string> = {
  410: "Dieser Link ist nicht mehr gültig.",
  429: "Zu viele Versuche, bitte später.",
};

export function JoinButton({
  token,
  kind,
  groupName,
}: {
  token: string;
  kind: "founder" | "member";
  groupName: string | null;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const groupLabel = groupName ?? "einer Gruppe";

  async function onClick() {
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/invitations/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.status === 200) {
        const body = (await res.json()) as { kind: "founder" | "member" };
        window.location.assign(body.kind === "founder" ? "/gruppe/neu" : "/");
        return;
      }
      setStatus({ kind: "error", message: ERRORS[res.status] ?? GENERIC });
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <p className="text-sm text-foreground-muted">
        {kind === "founder"
          ? "Du bist angemeldet. Mit diesem Link gründest du eine eigene Gruppe."
          : `Du bist angemeldet und trittst ${groupLabel} bei.`}
      </p>
      {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
      <Button type="button" onClick={onClick} loading={status.kind === "submitting"} className="w-full">
        {kind === "founder" ? "Gruppe gründen" : `Gruppe ${groupLabel} beitreten`}
      </Button>
    </div>
  );
}
