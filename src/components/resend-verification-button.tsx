"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

const ERRORS: Record<number, string> = {
  503: "Mail konnte nicht gesendet werden, bitte später erneut versuchen.",
  429: "Zu viele Versuche, bitte später.",
};

export function ResendVerificationButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/profile/email/resend", { method: "POST" });
      if (res.status === 204) {
        setStatus({ kind: "sent" });
        return;
      }
      setStatus({
        kind: "error",
        message: ERRORS[res.status] ?? "Unerwarteter Fehler. Bitte erneut versuchen.",
      });
    } catch {
      setStatus({ kind: "error", message: "Unerwarteter Fehler. Bitte erneut versuchen." });
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size="sm" onClick={onClick} loading={status.kind === "sending"}>
        Mail erneut senden
      </Button>
      {status.kind === "error" && (
        <p role="alert" className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive">
          {status.message}
        </p>
      )}
      {status.kind === "sent" && (
        <p role="status" className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success">
          Mail gesendet.
        </p>
      )}
    </div>
  );
}
