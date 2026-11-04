"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryAction } from "@/components/ui/list";
import { InlineMessage } from "@/components/ui/inline-message";

const START_ERRORS: Record<string, string> = {
  too_few_players: "Für den Start werden 4–6 bestätigte Spieler benötigt.",
  too_many_players: "Höchstens 6 bestätigte Spieler.",
  already_started: "Der Spieltag läuft bereits.",
};
const FALLBACK_ERROR = "Starten fehlgeschlagen.";

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error in START_ERRORS
      ? START_ERRORS[body.error]
      : FALLBACK_ERROR;
  } catch {
    return FALLBACK_ERROR;
  }
}

export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
      if (res.ok) router.refresh();
      else setError(await errorMessage(res));
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PrimaryAction onClick={onClick} disabled={loading} testId="start-game-day">
        {loading ? "Startet…" : "Spieltag starten"}
      </PrimaryAction>
      {error && (
        <div className="mt-2">
          <InlineMessage kind="error">{error}</InlineMessage>
        </div>
      )}
    </>
  );
}
