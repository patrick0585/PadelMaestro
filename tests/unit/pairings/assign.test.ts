import { describe, it, expect } from "vitest";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";
import { loadTemplate } from "@/lib/pairings/load";

describe("assignPlayersToTemplate", () => {
  const players = [
    { id: "p1", name: "Paul" },
    { id: "p2", name: "Werner" },
    { id: "p3", name: "Rene" },
    { id: "p4", name: "Thomas" },
    { id: "p5", name: "Michael" },
  ];

  it("produces 15 match plans for 5 players", () => {
    const plans = assignPlayersToTemplate(players, "seed-x");
    expect(plans).toHaveLength(15);
  });

  it("every plan has 2 distinct players in each team and matches the template sitting-count", () => {
    const plans = assignPlayersToTemplate(players, "seed-x");
    const template = loadTemplate(5);
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const tmpl = template.matches[i];
      expect(p.team1.map((x) => x.id).sort()).not.toEqual(p.team2.map((x) => x.id).sort());
      expect(p.sitting).toHaveLength(tmpl.sitting.length);
      const all = new Set([
        ...p.team1.map((x) => x.id),
        ...p.team2.map((x) => x.id),
        ...p.sitting.map((x) => x.id),
      ]);
      expect(all.size).toBe(5);
    }
  });

  it("is deterministic with the same seed", () => {
    const a = assignPlayersToTemplate(players, "seed-1");
    const b = assignPlayersToTemplate(players, "seed-1");
    expect(a).toEqual(b);
  });

  it("throws for unsupported player count", () => {
    expect(() => assignPlayersToTemplate(players.slice(0, 3), "seed")).toThrow(/unsupported/i);
  });
});
