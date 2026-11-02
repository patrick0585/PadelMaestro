import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { guardGroupAdmin, guardMember } from "@/lib/auth/route-guard";

function session(groupId: string | null, role: "owner" | "admin" | "member" | null) {
  (auth as Mock).mockResolvedValue({ user: { id: "u1", groupId, role } });
}

describe("guardGroupAdmin", () => {
  beforeEach(() => {
    (auth as Mock).mockReset();
  });

  it("401 ohne Session", async () => {
    (auth as Mock).mockResolvedValue(null);
    const { ctx, response } = await guardGroupAdmin();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "unauthorized" });
  });

  it("403 bei groupId null", async () => {
    session(null, null);
    const { ctx, response } = await guardGroupAdmin();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "forbidden" });
  });

  it("403 für member", async () => {
    session("g1", "member");
    const { ctx, response } = await guardGroupAdmin();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(403);
  });

  it("liefert ctx für admin", async () => {
    session("g1", "admin");
    const { ctx, response } = await guardGroupAdmin();
    expect(response).toBeNull();
    expect(ctx).toEqual({ userId: "u1", groupId: "g1", role: "admin" });
  });

  it("liefert ctx für owner", async () => {
    session("g1", "owner");
    const { ctx, response } = await guardGroupAdmin();
    expect(response).toBeNull();
    expect(ctx).toEqual({ userId: "u1", groupId: "g1", role: "owner" });
  });
});

describe("guardMember", () => {
  beforeEach(() => {
    (auth as Mock).mockReset();
  });

  it("401 ohne Session", async () => {
    (auth as Mock).mockResolvedValue(null);
    const { ctx, response } = await guardMember();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "unauthorized" });
  });

  it("403 ohne Gruppe", async () => {
    session(null, null);
    const { ctx, response } = await guardMember();
    expect(ctx).toBeNull();
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "forbidden" });
  });

  it("liefert ctx für member", async () => {
    session("g1", "member");
    const { ctx, response } = await guardMember();
    expect(response).toBeNull();
    expect(ctx).toEqual({ userId: "u1", groupId: "g1", role: "member" });
  });
});
