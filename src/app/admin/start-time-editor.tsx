"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GroupedList, SectionFooter } from "@/components/ui/list";
import { Button } from "@/components/ui/button";

export function StartTimeEditor({
  gameDayId,
  startTime,
}: {
  gameDayId: string;
  startTime: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(startTime ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== (startTime ?? "");

  async function save(next: string | null) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startTime: next }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError(
        res?.status === 409
          ? "Der Spieltag läuft schon, die Uhrzeit ist fest."
          : "Speichern fehlgeschlagen. Bitte erneut versuchen.",
      );
      return;
    }
    setValue(next ?? "");
    router.refresh();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(value || null);
      }}
    >
      <GroupedList>
        <div className="flex min-h-11 items-center gap-3 px-3.5 py-1.5">
          <label htmlFor="start-time" className="flex-1 text-[15px] text-foreground">
            Anpfiff
          </label>
          <input
            id="start-time"
            type="time"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 min-w-[7rem] rounded-xl border border-border-strong bg-surface-muted px-3 text-right text-[15px] tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {dirty ? (
            <Button type="submit" loading={loading}>
              Speichern
            </Button>
          ) : (
            startTime && (
              <Button
                type="button"
                variant="destructive"
                disabled={loading}
                onClick={() => void save(null)}
              >
                Entfernen
              </Button>
            )
          )}
        </div>
      </GroupedList>
      <SectionFooter>Optional. Erscheint auf der Startseite und in den Push-Nachrichten.</SectionFooter>
      {error && (
        <p role="alert" className="mx-3.5 mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
