"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

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
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/profile/email/resend", { method: "POST" });
      if (res.status === 204) {
        setStatus({ kind: "sent" });
        router.refresh();
        return;
      }
      if (res.status === 401) {
        window.location.href = "/login";
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

  const sending = status.kind === "sending";

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" onClick={onClick} loading={sending} aria-busy={sending}>
        Mail erneut senden
      </Button>
      <div aria-live="polite">
        {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
        {status.kind === "sent" && <InlineMessage kind="success">Mail gesendet.</InlineMessage>}
      </div>
    </div>
  );
}
