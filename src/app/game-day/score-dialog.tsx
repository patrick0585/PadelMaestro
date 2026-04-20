"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  matchId: string;
  format: "first-to-3" | "first-to-6";
  expectedVersion: number;
  onClose: () => void;
}

export function ScoreDialog({ matchId, format, expectedVersion, onClose }: Props) {
  const router = useRouter();
  const [team1, setTeam1] = useState(0);
  const [team2, setTeam2] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const presets =
    format === "first-to-3"
      ? ([[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]] as const)
      : ([] as const);

  async function submit(t1: number, t2: number) {
    setError(null);
    const res = await fetch(`/api/matches/${matchId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team1Score: t1, team2Score: t2, expectedVersion }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-dialog-title"
      onClick={onClose}
      className="fixed inset-0 flex items-center justify-center bg-black/50"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-80 space-y-4 rounded bg-white p-6"
      >
        <h3 id="score-dialog-title" className="text-lg font-semibold">
          Ergebnis eintragen
        </h3>
        {format === "first-to-3" ? (
          <div className="grid grid-cols-3 gap-2">
            {presets.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                onClick={() => submit(a, b)}
                className="rounded border px-2 py-2"
              >
                {a}:{b}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <label className="sr-only" htmlFor="team1-score">Team 1 Punkte</label>
            <input
              id="team1-score"
              type="number"
              min={0}
              value={team1}
              onChange={(e) => setTeam1(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-center"
            />
            <span aria-hidden="true">:</span>
            <label className="sr-only" htmlFor="team2-score">Team 2 Punkte</label>
            <input
              id="team2-score"
              type="number"
              min={0}
              value={team2}
              onChange={(e) => setTeam2(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-center"
            />
            <button
              onClick={() => submit(team1, team2)}
              className="rounded bg-black px-3 py-1 text-white"
            >
              OK
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={onClose} className="text-sm underline">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
