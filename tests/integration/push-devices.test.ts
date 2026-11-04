import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { hashPassword } from "@/lib/auth/hash";
import { deleteOwnAccount } from "@/lib/account/delete";
import { registerDevice, setRemindersEnabled, unregisterDevice } from "@/lib/push/devices";
import { POST, DELETE } from "@/app/api/push/devices/route";
import { PATCH } from "@/app/api/profile/push/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const TOKEN = "ab12cd34".repeat(8);

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://test${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function setup() {
  const group = await createTestGroup("G");
  const a = await createMember(group.id, { name: "A", email: "a@example.com" });
  const b = await createMember(group.id, { name: "B", email: "b@example.com" });
  return { group, a, b };
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
});

describe("push devices lib", () => {
  it("registers a device and refreshes lastSeenAt without a second row", async () => {
    const { a } = await setup();
    await registerDevice({ playerId: a.id, token: TOKEN });
    const first = await prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN } });
    expect(first.playerId).toBe(a.id);
    expect(first.platform).toBe("ios");
    expect(first.environment).toBe("production");
    await new Promise((r) => setTimeout(r, 10));
    await registerDevice({ playerId: a.id, token: TOKEN });
    const second = await prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN } });
    expect(await prisma.pushDevice.count()).toBe(1);
    expect(second.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
  });

  it("keeps at most 10 devices per player, dropping the oldest by lastSeenAt", async () => {
    const { a, b } = await setup();
    const tok = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
    await registerDevice({ playerId: b.id, token: tok(99) });
    for (let n = 1; n <= 10; n++) {
      await registerDevice({ playerId: a.id, token: tok(n) });
      await new Promise((r) => setTimeout(r, 3));
    }
    await registerDevice({ playerId: a.id, token: tok(1) });
    await new Promise((r) => setTimeout(r, 3));
    await registerDevice({ playerId: a.id, token: tok(11) });
    const left = (await prisma.pushDevice.findMany({ where: { playerId: a.id } })).map((d) => d.token);
    expect(left).toHaveLength(10);
    expect(left).toContain(tok(1));
    expect(left).toContain(tok(11));
    expect(left).not.toContain(tok(2));
    expect(await prisma.pushDevice.count({ where: { playerId: b.id } })).toBe(1);
  });

  it("moves the token to the player who registers it last", async () => {
    const { a, b } = await setup();
    await registerDevice({ playerId: a.id, token: TOKEN });
    await registerDevice({ playerId: b.id, token: TOKEN });
    expect(await prisma.pushDevice.count({ where: { playerId: a.id } })).toBe(0);
    expect(await prisma.pushDevice.count({ where: { playerId: b.id } })).toBe(1);
  });

  it("unregister by a foreign player deletes nothing, by the owner deletes", async () => {
    const { a, b } = await setup();
    await registerDevice({ playerId: a.id, token: TOKEN });
    await unregisterDevice({ playerId: b.id, token: TOKEN });
    expect(await prisma.pushDevice.count()).toBe(1);
    await unregisterDevice({ playerId: a.id, token: TOKEN });
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it("setRemindersEnabled persists", async () => {
    const { a } = await setup();
    await setRemindersEnabled(a.id, false);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).pushRemindersEnabled).toBe(false);
  });
});

describe("push routes", () => {
  it("POST/DELETE /api/push/devices: 401, 400, 204", async () => {
    const { a } = await setup();
    authMock.mockResolvedValue(null);
    expect((await POST(req("POST", "/api/push/devices", { token: TOKEN, platform: "ios" }))).status).toBe(401);
    expect((await DELETE(req("DELETE", "/api/push/devices", { token: TOKEN }))).status).toBe(401);

    authMock.mockResolvedValue({ user: { id: a.id } });
    const bad = await POST(req("POST", "/api/push/devices", { token: "xyz-not-hex", platform: "ios" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid" });
    expect((await POST(req("POST", "/api/push/devices", { token: TOKEN, platform: "android" }))).status).toBe(400);
    expect((await POST(req("POST", "/api/push/devices", { token: "ab12", platform: "ios" }))).status).toBe(400);
    expect((await POST(req("POST", "/api/push/devices", { token: "a".repeat(201), platform: "ios" }))).status).toBe(400);

    expect((await POST(req("POST", "/api/push/devices", { token: TOKEN, platform: "ios" }))).status).toBe(204);
    expect(await prisma.pushDevice.count({ where: { playerId: a.id } })).toBe(1);
    expect((await DELETE(req("DELETE", "/api/push/devices", { token: TOKEN }))).status).toBe(204);
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it("PATCH /api/profile/push: 401, 400, 200 and stored", async () => {
    const { a } = await setup();
    authMock.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", "/api/profile/push", { remindersEnabled: false }))).status).toBe(401);
    authMock.mockResolvedValue({ user: { id: a.id } });
    expect((await PATCH(req("PATCH", "/api/profile/push", { remindersEnabled: "no" }))).status).toBe(400);
    const res = await PATCH(req("PATCH", "/api/profile/push", { remindersEnabled: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ remindersEnabled: false });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).pushRemindersEnabled).toBe(false);
  });
});

describe("account deletion", () => {
  it("removes the player's devices", async () => {
    const group = await createTestGroup("G");
    await createMember(group.id, { name: "O", email: "o@example.com", role: "owner" });
    const hash = await hashPassword("geheim-genug-123");
    const p = await createMember(group.id, { name: "P", email: "p@example.com", passwordHash: hash });
    const q = await createMember(group.id, { name: "Q", email: "q@example.com" });
    await registerDevice({ playerId: p.id, token: TOKEN });
    await registerDevice({ playerId: q.id, token: "ffee0011".repeat(8) });
    await deleteOwnAccount({ playerId: p.id, password: "geheim-genug-123" });
    expect(await prisma.pushDevice.count({ where: { playerId: p.id } })).toBe(0);
    expect(await prisma.pushDevice.count({ where: { playerId: q.id } })).toBe(1);
  });
});
