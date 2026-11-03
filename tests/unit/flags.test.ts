import { describe, it, expect } from "vitest";
import { publicSignupEnabled } from "@/lib/flags";

describe("publicSignupEnabled", () => {
  it("is false for undefined, '', 'false', '1' and true only for 'true'", () => {
    expect(publicSignupEnabled({})).toBe(false);
    expect(publicSignupEnabled({ PUBLIC_SIGNUP: "" })).toBe(false);
    expect(publicSignupEnabled({ PUBLIC_SIGNUP: "false" })).toBe(false);
    expect(publicSignupEnabled({ PUBLIC_SIGNUP: "1" })).toBe(false);
    expect(publicSignupEnabled({ PUBLIC_SIGNUP: "true" })).toBe(true);
  });
});
