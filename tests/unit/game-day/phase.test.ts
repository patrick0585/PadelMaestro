import { describe, it, expect } from "vitest";
import { timelineForStatus } from "@/app/game-day/phase";

describe("timelineForStatus", () => {
  it("returns 4 steps with correct current and done flags", () => {
    const steps = timelineForStatus("roster_locked");
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming", "upcoming"]);
  });

  it("marks everything done when finished", () => {
    const steps = timelineForStatus("finished");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "done", "done"]);
  });

  it("marks step 1 as current for planned", () => {
    const steps = timelineForStatus("planned");
    expect(steps.map((s) => s.status)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks step 3 as current for in_progress", () => {
    const steps = timelineForStatus("in_progress");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "current", "upcoming"]);
  });
});
