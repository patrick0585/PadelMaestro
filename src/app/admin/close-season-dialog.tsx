"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_names: "Bitte zwei unterschiedliche, nicht leere Namen angeben.",
  name_conflict: "Dieser Saisonname ist bereits vergeben.",
  no_active_season: "Keine aktive Saison gefunden.",
};

export function CloseSeasonDialog({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closedName, setClosedName] = useState(currentName);
  const [nextName, setNextName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setClosedName(currentName);
      setNextName("");
      setError(null);
    }
  }, [open, currentName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/seasons/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ closedName, nextName }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        days?: string[];
      };
      if (body.error === "open_game_days") {
        const dates = (body.days ?? [])
          .map((d) =>
            new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", {
              timeZone: "UTC",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
          )
          .join(", ");
        setError(`Es gibt noch offene Spieltage: ${dates}. Bitte erst beenden oder löschen.`);
      } else {
        setError(ERROR_MESSAGES[body.error ?? ""] ?? "Abschließen fehlgeschlagen");
      }
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        Saison abschließen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Saison abschließen">
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-foreground">
            Die aktuelle Tabelle wandert unter dem Archiv-Namen ins Archiv. Danach
            startet die neue Saison bei 0 Punkten und jeder hat wieder 2 Joker.
          </p>
          <div>
            <Label htmlFor="close-season-closed-name">Name im Archiv</Label>
            <Input
              id="close-season-closed-name"
              value={closedName}
              onChange={(e) => setClosedName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="close-season-next-name">Name der neuen Saison</Label>
            <Input
              id="close-season-next-name"
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
              placeholder="z. B. Rückrunde 2026"
              required
            />
          </div>
          {error && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Abbrechen
            </Button>
            <Button type="submit" variant="destructive" loading={loading}>
              Abschließen
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
