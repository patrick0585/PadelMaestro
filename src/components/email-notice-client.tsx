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
  showProfileLink = true,
}: {
  variant: "placeholder" | "unverified";
  pending: string | null;
  showProfileLink?: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
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

  const ring =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div
      role="region"
      aria-label="Hinweis zur E-Mail-Adresse"
      className="flex items-start gap-3 rounded-2xl border border-l-4 border-border border-l-primary bg-surface p-4"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold text-foreground">{TEXT[variant]}</p>
        {pending && (
          <p className="break-all text-sm text-foreground-muted">Bestätigung ausstehend für {pending}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {showProfileLink && (
            <Link
              href="/profil"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline ${ring}`}
            >
              Zum Profil
            </Link>
          )}
          {variant === "unverified" && <ResendVerificationButton />}
        </div>
      </div>
      <button
        type="button"
        aria-label="Hinweis schließen"
        onClick={dismiss}
        className={`-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-foreground-muted hover:text-foreground ${ring}`}
      >
        ×
      </button>
    </div>
  );
}
