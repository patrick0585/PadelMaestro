import { describe, it, expect } from "vitest";
import { formatMemberSince } from "@/lib/profile/player-pass";

describe("formatMemberSince", () => {
  it("formats month and year in German, UTC", () => {
    expect(formatMemberSince(new Date("2025-04-01T00:00:00Z"))).toBe("Dabei seit April 2025");
    expect(formatMemberSince(new Date("2025-12-31T23:30:00Z"))).toBe("Dabei seit Dezember 2025");
  });
});
