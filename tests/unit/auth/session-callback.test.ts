import { describe, it, expect } from "vitest";
import { authConfig } from "@/auth.config";

type SessionArgs = Parameters<typeof authConfig.callbacks.session>[0];

function run(token: Record<string, unknown>) {
  const args = { session: { user: {} }, token } as unknown as SessionArgs;
  return authConfig.callbacks.session(args) as unknown as {
    user: { id: string; isAdmin: boolean; groupId: string | null; role: string | null };
  };
}

describe("session callback", () => {
  it("copies group claims from the token", () => {
    const { user } = run({ id: "p1", isAdmin: true, groupId: "g", role: "owner" });
    expect(user).toMatchObject({ id: "p1", isAdmin: true, groupId: "g", role: "owner" });
  });

  it("defaults missing claims", () => {
    const { user } = run({ id: "p1" });
    expect(user.groupId).toBeNull();
    expect(user.role).toBeNull();
    expect(user.isAdmin).toBe(false);
  });
});
