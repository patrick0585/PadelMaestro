"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PrimaryAction } from "@/components/ui/list";

export function CreateGameDayForm() {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/game-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setLoading(false);
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "date_exists") {
        setError("Für diesen Tag existiert bereits ein Spieltag");
      } else {
        setError("Anlegen fehlgeschlagen");
      }
      return;
    }
    if (!res.ok) {
      setError("Anlegen fehlgeschlagen");
      return;
    }
    const body = (await res.json().catch(() => null)) as { gameDay?: { id?: string } } | null;
    setDate("");
    const id = body?.gameDay?.id;
    if (id) router.push(`/admin/spieltage/${id}`);
    else router.refresh();
  }

  if (!expanded) {
    return (
      <PrimaryAction onClick={() => setExpanded(true)} testId="create-game-day">
        ＋ Spieltag anlegen
      </PrimaryAction>
    );
  }

  return (
    <form onSubmit={onSubmit} data-testid="create-game-day-form" className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[12rem]">
        <Label htmlFor="game-day-date">Datum</Label>
        <Input
          id="game-day-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <Button type="submit" loading={loading} data-testid="create-game-day-submit">
        Anlegen
      </Button>
      {error && (
        <p className="w-full rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
