"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

const MESSAGES: Record<string, string> = {
  owner_protected: "Als Besitzer kannst du die Gruppe nicht verlassen.",
  last_admin: "Du bist der letzte Admin. Ernenne zuerst einen anderen.",
  active_participation: "Du bist für einen Spieltag eingeplant. Sag erst ab.",
};

export function LeaveGroupButton({ groupName }: { groupName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (confirming) {
      actionsRef.current?.querySelector<HTMLButtonElement>('button[data-cancel]')?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [confirming]);

  function close() {
    restoreFocus.current = true;
    setConfirming(false);
  }

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
      close();
    } catch {
      setError("Verlassen fehlgeschlagen.");
      close();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2" aria-live="polite">
      {error && <InlineMessage kind="error">{error}</InlineMessage>}
      {confirming ? (
        <div role="group" aria-labelledby={textId} className="flex flex-col gap-2">
          <p id={textId} className="text-sm text-foreground">
            Gruppe „{groupName}“ wirklich verlassen? Du kommst nur mit neuer Einladung zurück.
          </p>
          <div ref={actionsRef} className="flex flex-wrap gap-2">
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
              data-cancel=""
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={loading}
              onClick={close}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div ref={triggerRef}>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 !text-destructive"
            onClick={() => setConfirming(true)}
          >
            Gruppe verlassen
          </Button>
        </div>
      )}
    </div>
  );
}
