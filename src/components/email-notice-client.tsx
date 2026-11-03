"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ResendVerificationButton } from "@/components/resend-verification-button";

const DISMISS_KEY = "email-notice-dismissed";

const TEXT = {
  placeholder: "Hinterlege deine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst.",
  unverified: "Bitte bestätige deine E-Mail-Adresse.",
} as const;

export function EmailNoticeClient({
  variant,
  pending,
}: {
  variant: "placeholder" | "unverified";
  pending: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // Storage nicht verfügbar: Banner bleibt sichtbar
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // egal
    }
    setDismissed(true);
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-foreground">{TEXT[variant]}</p>
        {pending && (
          <p className="text-sm text-foreground-muted">Bestätigung ausstehend für {pending}</p>
        )}
        <Link href="/profil" className="inline-block text-sm font-semibold text-primary">
          Zum Profil
        </Link>
        {variant === "unverified" && <ResendVerificationButton />}
      </div>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={dismiss}
        className="shrink-0 rounded-lg px-2 text-lg leading-none text-foreground-muted hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}
