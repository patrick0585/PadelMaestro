"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppleLogo, useAppleAvailable } from "@/components/apple-button";
import { ListRow } from "@/components/ui/list";
import { isAppleCancel, signInWithApple } from "@/lib/native/apple-sign-in";
import { APPLE_ERROR_MESSAGES } from "@/lib/auth/apple/errors";

const ICON = { node: <AppleLogo className="h-[15px] w-3" />, color: "#000000" };

function failureText(status: number, body: { message?: string }): string {
  if (status === 409) return body.message ?? APPLE_ERROR_MESSAGES.apple_already_linked;
  if (status === 400) return body.message ?? APPLE_ERROR_MESSAGES.apple_invalid_token;
  if (status === 429) return APPLE_ERROR_MESSAGES.rate_limited;
  if (status === 503) return APPLE_ERROR_MESSAGES.apple_unavailable;
  return APPLE_ERROR_MESSAGES.apple_invalid_token;
}

/** Profile row: shows the linked state or offers to attach an Apple ID. */
export function AppleLinkRow({ linked, configured }: { linked: boolean; configured: boolean }) {
  const router = useRouter();
  const available = useAppleAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (linked) {
    return (
      <ListRow
        icon={ICON}
        title="Anmeldung mit Apple"
        trailing={
          <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
            Apple · verbunden
          </span>
        }
      />
    );
  }
  if (!configured || !available) return null;

  async function link() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const credentials = await signInWithApple();
      const res = await fetch("/api/account/apple/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identityToken: credentials.identityToken,
          authorizationCode: credentials.authorizationCode,
        }),
      });
      if (res.status === 204) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(failureText(res.status, body));
    } catch (e) {
      if (!isAppleCancel(e)) setError(APPLE_ERROR_MESSAGES.apple_unavailable);
    }
    setBusy(false);
  }

  return (
    <ListRow
      onClick={link}
      icon={ICON}
      title={busy ? "Apple wird verbunden …" : "Mit Apple verbinden"}
      subtitle={error ? <span role="alert" className="text-destructive">{error}</span> : undefined}
      chevron
    />
  );
}
