import { describe, expect, it } from "vitest";
import * as impressum from "@/content/legal/impressum";
import * as datenschutz from "@/content/legal/datenschutz";
import * as nutzungsbedingungen from "@/content/legal/nutzungsbedingungen";

const modules = [impressum, datenschutz, nutzungsbedingungen];

describe("legal content", () => {
  it("every legal module exports title, updatedAt (ISO date) and a Content component", () => {
    for (const m of modules) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof m.default).toBe("function");
    }
  });

  it("no legal module is still a placeholder", () => {
    expect(modules.every((m) => m.PLACEHOLDER === false)).toBe(true);
  });
});
