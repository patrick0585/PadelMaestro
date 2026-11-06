"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ResendVerificationButton } from "@/components/resend-verification-button";

const DISMISS_KEY = "email-notice-dismissed";
// Home shows a one-line version; dismissed there it stays gone (the profile keeps the full notice).
const HOME_DISMISS_KEY = "email-notice-home-dismissed";

const DISMISS = {
  compact: { key: HOME_DISMISS_KEY, store: () => window.localStorage },
  full: { key: DISMISS_KEY, store: () => window.sessionStorage },
} as const;

const COMPACT_TEXT = {
  placeholder: "E-Mail ergänzen, damit du dein Passwort zurücksetzen kannst",
  unverified: "E-Mail bestätigen, damit du dein Passwort zurücksetzen kannst",
} as const;

const TEXT = {
  placeholder: "Hinterlege deine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst.",
  unverified: "Bitte bestätige deine E-Mail-Adresse.",
} as const;

export function EmailNoticeClient({
  variant,
  pending,
  showProfileLink = true,
  compact = false,
}: {
  variant: "placeholder" | "unverified";
  pending: string | null;
  showProfileLink?: boolean;
  compact?: boolean;
}) {
  const [dismissed, setDismissed] = useState(true);
  const dismissal = DISMISS[compact ? "compact" : "full"];

  useEffect(() => {
    try {
      setDismissed(dismissal.store().getItem(dismissal.key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [dismissal]);

  if (dismissed) return null;

  function dismiss() {
    try {
      dismissal.store().setItem(dismissal.key, "1");
    } catch {
      // egal
    }
    setDismissed(true);
  }

  const ring =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const closeButton = (
    <button
      type="button"
      aria-label="Hinweis schließen"
      onClick={dismiss}
      className={`-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-foreground-muted hover:text-foreground ${ring}`}
    >
      ×
    </button>
  );

  if (compact) {
    return (
      <div
        role="region"
        aria-label="Hinweis zur E-Mail-Adresse"
        className="flex items-center gap-3 rounded-2xl border border-l-4 border-border border-l-primary bg-surface py-1 pl-3.5 pr-3"
      >
        <Link
          href="/profil/email"
          className={`flex min-h-11 min-w-0 flex-1 items-center text-[13px] font-semibold text-foreground ${ring}`}
        >
          {COMPACT_TEXT[variant]} <span className="ml-1 text-primary" aria-hidden="true">›</span>
        </Link>
        {closeButton}
      </div>
    );
  }

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
              href="/profil/email"
              className={`inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline ${ring}`}
            >
              Zur E-Mail-Adresse
            </Link>
          )}
          {variant === "unverified" && <ResendVerificationButton />}
        </div>
      </div>
      {closeButton}
    </div>
  );
}
