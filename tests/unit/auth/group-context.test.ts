import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import {
  ForbiddenError,
  NoGroupError,
  getGroupContext,
  requireGroupAdmin,
  requireMember,
  requireOwner,
} from "@/lib/auth/group-context";

function session(groupId: string | null, role: "owner" | "admin" | "member" | null) {
  (auth as Mock).mockResolvedValue({ user: { id: "u1", groupId, role } });
}

describe("group-context", () => {
  beforeEach(() => {
    (auth as Mock).mockReset();
  });

  it("returns null without a session", async () => {
    (auth as Mock).mockResolvedValue(null);
    expect(await getGroupContext()).toBeNull();
  });

  it("returns null when the session has no group", async () => {
    session(null, null);
    expect(await getGroupContext()).toBeNull();
  });

  it("requireMember throws NoGroupError without a group", async () => {
    session(null, null);
    await expect(requireMember()).rejects.toBeInstanceOf(NoGroupError);
  });

  it("requireGroupAdmin throws ForbiddenError for a member", async () => {
    session("g1", "member");
    await expect(requireGroupAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireOwner throws ForbiddenError for an admin", async () => {
    session("g1", "admin");
    await expect(requireOwner()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner passes all three guards", async () => {
    session("g1", "owner");
    const ctx = { userId: "u1", groupId: "g1", role: "owner" };
    expect(await requireMember()).toEqual(ctx);
    expect(await requireGroupAdmin()).toEqual(ctx);
    expect(await requireOwner()).toEqual(ctx);
  });
});
