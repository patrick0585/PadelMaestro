"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Side-effect-only client component: opens an SSE connection to the
// game-day events endpoint and triggers an RSC refresh whenever the
// server publishes an update. The browser auto-reconnects on transient
// disconnects (default behaviour of EventSource).
export function GameDayLiveUpdates({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/game-day/${gameDayId}/events`);
    const onUpdate = () => router.refresh();
    source.addEventListener("update", onUpdate);
    return () => {
      source.removeEventListener("update", onUpdate);
      source.close();
    };
    // router is stable across renders in App Router; depending on it
    // would mean a future framework change could tear down the SSE
    // connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDayId]);

  return null;
}
