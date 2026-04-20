import { describe, it, expect } from "vitest";
import { loadTemplate } from "@/lib/pairings/load";

describe("loadTemplate", () => {
  it("loads 4-player template", () => {
    const t = loadTemplate(4);
    expect(t.playerCount).toBe(4);
    expect(t.matches).toHaveLength(3);
  });

  it("loads 5-player template", () => {
    const t = loadTemplate(5);
    expect(t.playerCount).toBe(5);
    expect(t.matches).toHaveLength(15);
  });

  it("loads 6-player template", () => {
    const t = loadTemplate(6);
    expect(t.playerCount).toBe(6);
    expect(t.matches).toHaveLength(15);
  });

  it("throws for unsupported player counts", () => {
    expect(() => loadTemplate(3)).toThrow(/unsupported/i);
    expect(() => loadTemplate(7)).toThrow(/unsupported/i);
  });
});
