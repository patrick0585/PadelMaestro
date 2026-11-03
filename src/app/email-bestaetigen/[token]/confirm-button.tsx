"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const GENERIC = "Unerwarteter Fehler. Bitte erneut versuchen.";
const ERRORS: Record<number, string> = {
  400: "Dieser Link ist ungültig oder abgelaufen.",
  409: "Diese Adresse ist inzwischen vergeben.",
  429: "Zu viele Versuche, bitte später.",
};

export function ConfirmButton({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onClick() {
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/email-verification/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setStatus(
        res.status === 200
          ? { kind: "success" }
          : { kind: "error", message: ERRORS[res.status] ?? GENERIC },
      );
    } catch {
      setStatus({ kind: "error", message: GENERIC });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
        <InlineMessage kind="success">Adresse bestätigt</InlineMessage>
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Zur App
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
      <Button type="button" onClick={onClick} loading={status.kind === "submitting"} className="w-full">
        Adresse bestätigen
      </Button>
    </div>
  );
}
