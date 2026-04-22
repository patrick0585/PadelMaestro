import { describe, it, expect } from "vitest";
import { timelineForStatus } from "@/app/game-day/phase";

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
