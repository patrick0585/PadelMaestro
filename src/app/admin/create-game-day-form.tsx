"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGameDayForm() {
  const router = useRouter();
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
    setDate("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
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
      <Button type="submit" loading={loading}>
        Spieltag anlegen
      </Button>
      {error && (
        <p className="w-full rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
