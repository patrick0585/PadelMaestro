"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REOPEN_DELAY_MS = 5_000;
const MAX_REOPEN_DELAY_MS = 60_000;

// Opens an SSE connection to the game-day events endpoint and refreshes
// the RSC tree on every server update. iOS drops the connection when the
// app goes to the background, so the stream is closed while hidden and
// reopened with a refresh on return; any reconnect also refreshes to
// pick up updates published while disconnected.
export function GameDayLiveUpdates({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();

  useEffect(() => {
    let source: EventSource | null = null;
    let reopenTimer: ReturnType<typeof setTimeout> | null = null;
    // Set when updates may have been missed (lost connection, resume), so
    // the next successful open refreshes.
    let missedUpdates = false;
    let reopenDelay = REOPEN_DELAY_MS;

    const refresh = () => router.refresh();

    const close = () => {
      if (reopenTimer) clearTimeout(reopenTimer);
      reopenTimer = null;
      source?.close();
      source = null;
    };

    const open = () => {
      close();
      const es = new EventSource(`/api/game-day/${gameDayId}/events`);
      let opened = false;
      es.addEventListener("update", refresh);
      es.addEventListener("open", () => {
        if (opened || missedUpdates) refresh();
        opened = true;
        missedUpdates = false;
        reopenDelay = REOPEN_DELAY_MS;
      });
      es.addEventListener("error", () => {
        // Browsers retry on their own unless they gave up (CLOSED).
        if (es.readyState !== EventSource.CLOSED || source !== es) return;
        missedUpdates = true;
        reopenTimer = setTimeout(() => {
          if (document.visibilityState === "visible") open();
        }, reopenDelay);
        reopenDelay = Math.min(reopenDelay * 2, MAX_REOPEN_DELAY_MS);
      });
      source = es;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        close();
      } else if (!source) {
        // Refresh now for a quick update, and again once subscribed so
        // nothing published during the reconnect is lost.
        refresh();
        missedUpdates = true;
        open();
      }
    };

    if (document.visibilityState !== "hidden") open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
    // router is stable across renders in App Router; depending on it
    // would mean a future framework change could tear down the SSE
    // connection on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameDayId]);

  return null;
}
