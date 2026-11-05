import { describe, it, expect } from "vitest";
import { shouldSubscribeToLiveUpdates } from "@/app/game-day/phase";

describe("shouldSubscribeToLiveUpdates", () => {
  it("subscribes during in_progress", () => {
    expect(shouldSubscribeToLiveUpdates("in_progress")).toBe(true);
  });

  it("does not subscribe during planned", () => {
    expect(shouldSubscribeToLiveUpdates("planned")).toBe(false);
  });

  it("does not subscribe once finished", () => {
    expect(shouldSubscribeToLiveUpdates("finished")).toBe(false);
  });
});
