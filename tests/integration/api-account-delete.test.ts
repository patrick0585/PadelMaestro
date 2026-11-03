import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { hashPassword } from "@/lib/auth/hash";
import { rateLimitResetForTests } from "@/lib/rate-limit";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { DELETE } from "@/app/api/profile/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://test/api/profile", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  rateLimitResetForTests();
});

describe("DELETE /api/profile", () => {
  it("DELETE /api/profile 401, 400 without password, 403 wrong_password, 409 owner_of_group with groups, 204 then player anonymised, 429 after five attempts", async () => {
    const g = await createTestGroup("Padelfreunde");
    const passwordHash = await hashPassword("geheim123");
    const owner = await createMember(g.id, { name: "O", email: "o@x.de", role: "owner", passwordHash });
    const member = await createMember(g.id, { name: "M", email: "m@x.de", passwordHash });

    authMock.mockResolvedValue(null);
    expect((await DELETE(req({ password: "geheim123" }))).status).toBe(401);

    authMock.mockResolvedValue({ user: { id: member.id } });
    expect((await DELETE(req({}))).status).toBe(400);
    expect((await DELETE(req({ password: "" }))).status).toBe(400);
    const wrong = await DELETE(req({ password: "falsch" }));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: "wrong_password" });

    authMock.mockResolvedValue({ user: { id: owner.id } });
    const blocked = await DELETE(req({ password: "geheim123" }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      error: "owner_of_group",
      groups: [{ id: g.id, name: "Padelfreunde" }],
    });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: owner.id } })).deletedAt).toBeNull();

    authMock.mockResolvedValue({ user: { id: member.id } });
    const ok = await DELETE(req({ password: "geheim123" }));
    expect(ok.status).toBe(204);
    const gone = await prisma.player.findUniqueOrThrow({ where: { id: member.id } });
    expect(gone.name).toBe("Gelöschter Spieler");
    expect(gone.deletedAt).not.toBeNull();
    expect(gone.passwordHash).toBeNull();
    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: g.id, playerId: member.id } },
    });
    expect(m.removedAt).not.toBeNull();
  });

  it("429 after five attempts within the hour", async () => {
    const g = await createTestGroup("A");
    const p = await createMember(g.id, {
      name: "M",
      email: "m@x.de",
      passwordHash: await hashPassword("geheim123"),
    });
    authMock.mockResolvedValue({ user: { id: p.id } });
    for (let i = 0; i < 5; i++) {
      expect((await DELETE(req({ password: "falsch" }))).status).toBe(403);
    }
    expect((await DELETE(req({ password: "geheim123" }))).status).toBe(429);
  });

  it("409 anonymisation_collision when the anonymised address is taken", async () => {
    const g = await createTestGroup("A");
    const p = await createMember(g.id, {
      name: "M",
      email: "m@x.de",
      passwordHash: await hashPassword("geheim123"),
    });
    await prisma.player.create({ data: { name: "B", email: `geloescht-${p.id}@anonym.invalid` } });
    authMock.mockResolvedValue({ user: { id: p.id } });
    const res = await DELETE(req({ password: "geheim123" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "anonymisation_collision" });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).toBeNull();
  });
});
