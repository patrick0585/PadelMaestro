"use client";

import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/platform";
import { GroupedList, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";

export function PushSettings({ remindersEnabled }: { remindersEnabled: boolean }) {
  const [native, setNative] = useState(false);
  const [enabled, setEnabled] = useState(remindersEnabled);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  if (!native) return null;

  async function toggle() {
    const previous = enabled;
    setEnabled(!previous);
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/profile/push", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remindersEnabled: !previous }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setEnabled(previous);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionLabel>Benachrichtigungen</SectionLabel>
      <GroupedList>
        <ListRow
          title="Erinnerungen"
          trailing={
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Erinnerungen"
              disabled={saving}
              onClick={toggle}
              className="-my-2 -mr-2 grid h-11 min-w-11 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className={`relative block h-[31px] w-[51px] rounded-full motion-safe:transition-colors ${
                  enabled ? "bg-primary" : "bg-border-strong"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 block size-[27px] rounded-full bg-white shadow motion-safe:transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          }
        />
      </GroupedList>
      <SectionFooter>
        Erinnerung am Vortag um 18 Uhr und am Spieltag um 14 Uhr, wenn du noch nicht abgestimmt
        hast.
      </SectionFooter>
      <p role="status" aria-live="polite" className="mx-3.5 mt-1.5 text-xs text-destructive">
        {failed ? "Konnte nicht gespeichert werden." : ""}
      </p>
    </section>
  );
}
