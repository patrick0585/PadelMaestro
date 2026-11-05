export type GameDayStatus = "planned" | "in_progress" | "finished";

// SSE subscription is only meaningful while the day is being played —
// before that there is nothing to update, after that nothing changes.
export function shouldSubscribeToLiveUpdates(status: GameDayStatus): boolean {
  return status === "in_progress";
}
