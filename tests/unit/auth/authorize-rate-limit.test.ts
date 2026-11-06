import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ rateLimitRequest: () => ({ allowed: false }) }));
import { authorizeCredentials, LoginRateLimited } from "@/lib/auth/authorize";

describe("authorizeCredentials bei Anmeldesperre", () => {
  it("meldet die Sperre mit eigenem Code statt wie ein falsches Passwort", async () => {
    const req = new Request("http://localhost/api/auth/callback/credentials", { method: "POST" });
    const attempt = authorizeCredentials({ identifier: "anna", password: "demo12345" }, req);
    await expect(attempt).rejects.toBeInstanceOf(LoginRateLimited);
    await expect(authorizeCredentials({ identifier: "anna", password: "x" }, req)).rejects.toMatchObject({ code: "rate_limited" });
  });
});
