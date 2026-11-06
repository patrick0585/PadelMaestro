"use client";
import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/next-path";

const GENERIC = "Speichern fehlgeschlagen. Bitte erneut versuchen.";

export function NameForm({ next }: { next?: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 204) {
        window.location.assign(safeNextPath(next));
        return;
      }
      setError(res.status === 400 ? "Bitte gib einen Namen mit höchstens 60 Zeichen ein." : GENERIC);
    } catch {
      setError(GENERIC);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Dein Name</Label>
        <Input
          id="display-name"
          type="text"
          className="h-[46px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Max Müller"
          maxLength={60}
          autoComplete="name"
          autoFocus
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" loading={loading} disabled={name.trim().length === 0} className="w-full">
        Weiter
      </Button>
    </form>
  );
}
