// In-process pub/sub for live game-day events. Each subscriber registers
// a listener keyed by gameDayId; publishers (the score-save endpoint) call
// publishGameDayUpdate to fan out to every subscriber for that day.
//
// This is intentionally process-local: the production deploy is a single
// Node process behind Caddy, so a Map<string, Set<Listener>> is the right
// fit. If we ever scale horizontally we'd swap this implementation for
// Redis pub/sub or Postgres LISTEN/NOTIFY without changing callers.

export type LiveListener = () => void;

const listeners = new Map<string, Set<LiveListener>>();

export function subscribeToGameDay(
  gameDayId: string,
  listener: LiveListener,
): () => void {
  let set = listeners.get(gameDayId);
  if (!set) {
    set = new Set();
    listeners.set(gameDayId, set);
  }
  set.add(listener);

  return () => {
    const current = listeners.get(gameDayId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(gameDayId);
  };
}

export function publishGameDayUpdate(gameDayId: string): void {
  const set = listeners.get(gameDayId);
  if (!set) return;
  // Snapshot before iteration so a listener that unsubscribes itself
  // mid-iteration cannot mutate the set we are walking.
  for (const listener of [...set]) {
    try {
      listener();
    } catch (err) {
      console.warn("[live-broadcast] listener threw, dropping it", err);
      set.delete(listener);
    }
  }
}

// Test helper — never call from production code.
export function __resetLiveBroadcastForTests(): void {
  listeners.clear();
}

export function getActiveSubscriberCount(gameDayId: string): number {
  return listeners.get(gameDayId)?.size ?? 0;
}
