"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

const MESSAGES: Record<string, string> = {
  owner_protected: "Als Besitzer kannst du die Gruppe nicht verlassen.",
  last_admin: "Du bist der letzte Admin. Ernenne zuerst einen anderen.",
  active_participation: "Du bist für einen Spieltag eingeplant. Sag erst ab.",
};

export function LeaveGroupButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLeave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/leave-group", { method: "POST" });
      if (res.status === 204) {
        window.location.assign("/");
        return;
      }
      let code: string | undefined;
      if (res.status === 409) {
        code = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
      }
      setError((code && MESSAGES[code]) || "Verlassen fehlgeschlagen.");
      setConfirming(false);
    } catch {
      setError("Verlassen fehlgeschlagen.");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <InlineMessage kind="error">{error}</InlineMessage>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground">Wirklich verlassen?</span>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            loading={loading}
            onClick={onLeave}
          >
            Ja, verlassen
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={loading}
            onClick={() => setConfirming(false)}
          >
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="destructive"
          className="min-h-11"
          onClick={() => setConfirming(true)}
        >
          Gruppe verlassen
        </Button>
      )}
    </div>
  );
}
