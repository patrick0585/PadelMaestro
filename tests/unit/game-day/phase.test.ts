import { describe, it, expect } from "vitest";
import { shouldSubscribeToLiveUpdates, timelineForStatus } from "@/app/game-day/phase";

describe("timelineForStatus", () => {
  it("returns exactly 3 steps labelled Geplant / Matches / Fertig", () => {
    const steps = timelineForStatus("planned");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.label)).toEqual(["Geplant", "Matches", "Fertig"]);
    expect(steps.map((s) => s.id)).toEqual(["planned", "matches", "finished"]);
  });

  it("marks Geplant as current when status=planned", () => {
    const steps = timelineForStatus("planned");
    expect(steps.map((s) => s.status)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("marks Matches as current when status=roster_locked", () => {
    const steps = timelineForStatus("roster_locked");
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming"]);
  });

  it("marks Matches as current when status=in_progress (same as roster_locked)", () => {
    const steps = timelineForStatus("in_progress");
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming"]);
  });

  it("marks everything done with Fertig current when finished", () => {
    const steps = timelineForStatus("finished");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "current"]);
  });
});

describe("shouldSubscribeToLiveUpdates", () => {
  // The first score also flips status from roster_locked -> in_progress
  // and broadcasts in the same transaction. If we only subscribe at
  // in_progress we miss the very first update for every observer.
  it("subscribes already at roster_locked so the M1 broadcast is delivered", () => {
    expect(shouldSubscribeToLiveUpdates("roster_locked")).toBe(true);
  });

  it("subscribes during in_progress", () => {
    expect(shouldSubscribeToLiveUpdates("in_progress")).toBe(true);
  });

  it("does not subscribe during planned (no scores possible yet)", () => {
    expect(shouldSubscribeToLiveUpdates("planned")).toBe(false);
  });

  it("does not subscribe once finished", () => {
    expect(shouldSubscribeToLiveUpdates("finished")).toBe(false);
  });
});
