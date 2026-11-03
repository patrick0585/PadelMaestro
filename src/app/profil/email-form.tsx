"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineMessage } from "@/components/ui/inline-message";
import { ResendVerificationButton } from "@/components/resend-verification-button";
import { isPlaceholderEmail } from "@/lib/auth/email";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; address: string }
  | { kind: "error"; message: string };

const ERRORS: Record<number, string> = {
  409: "Diese Adresse ist schon vergeben.",
  503: "Mail konnte nicht gesendet werden, bitte später erneut versuchen.",
  429: "Zu viele Versuche, bitte später.",
  400: "Bitte eine gültige E-Mail-Adresse eingeben.",
};

export function EmailForm({
  email,
  pendingEmail,
  emailVerified,
}: {
  email: string;
  pendingEmail: string | null;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/profile/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      if (res.status === 204) {
        setStatus({ kind: "success", address });
        setValue("");
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="break-all font-semibold text-foreground">{email}</span>
        <Badge variant={emailVerified ? "success" : "warning"}>
          {emailVerified ? "Bestätigt" : "Unbestätigt"}
        </Badge>
      </div>
      {pendingEmail && (
        <p className="text-sm break-all text-foreground-muted">Bestätigung ausstehend für {pendingEmail}</p>
      )}
      {!emailVerified && (pendingEmail || !isPlaceholderEmail(email)) && <ResendVerificationButton />}
      <form onSubmit={onSubmit} className="space-y-3 border-t border-border pt-3">
        <div>
          <Label htmlFor="new-email">Neue E-Mail-Adresse</Label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </div>
        {status.kind === "error" && <InlineMessage kind="error">{status.message}</InlineMessage>}
        {status.kind === "success" && (
          <InlineMessage kind="success">
            Wir haben dir eine Mail an {status.address} geschickt.
          </InlineMessage>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={status.kind === "submitting"}>
            Ändern
          </Button>
        </div>
      </form>
    </div>
  );
}
