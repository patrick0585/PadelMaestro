import { describe, it, expect } from "vitest";
import { assignPlayersToTemplate, sortPlayersForAssignment } from "@/lib/pairings/assign";

describe("sortPlayersForAssignment", () => {
  const players = [
    { id: "c", name: "Anna" },
    { id: "a", name: "Zoe" },
    { id: "b", name: "Mia" },
  ];

  it("orders players by id ascending, ignoring names", () => {
    expect(sortPlayersForAssignment(players).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    sortPlayersForAssignment(players);
    expect(players.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("makes the plan independent of input order", () => {
    const four = [...players, { id: "d", name: "Ben" }];
    const reversed = [...four].reverse();
    expect(assignPlayersToTemplate(sortPlayersForAssignment(reversed), "s")).toEqual(
      assignPlayersToTemplate(sortPlayersForAssignment(four), "s"),
    );
  });
});
