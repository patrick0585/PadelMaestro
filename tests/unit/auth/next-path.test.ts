import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("safeNextPath keeps '/einladung/abc', '/gruppe/neu?x=1' and rejects '//evil', 'https://evil', 'javascript:alert(1)', '', null → '/'", () => {
    expect(safeNextPath("/einladung/abc")).toBe("/einladung/abc");
    expect(safeNextPath("/gruppe/neu?x=1")).toBe("/gruppe/neu?x=1");
    for (const bad of ["//evil", "https://evil", "javascript:alert(1)", "/\\evil", "\\evil", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});
