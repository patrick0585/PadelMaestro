import { describe, it, expect } from "vitest";
import { isAdminRole } from "@/lib/auth/roles";

describe("isAdminRole", () => {
  it("is true for owner and admin", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
  });
  it("is false for member, null and undefined", () => {
    expect(isAdminRole("member")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});
