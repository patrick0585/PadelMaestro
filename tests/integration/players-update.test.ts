import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH } from "@/app/api/players/[id]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: {
      name: `Admin${i}`,
      email: `a${i}@x`,
      passwordHash: "x",
      isAdmin: true,
    },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}

function patchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/players/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function call(id: string, body: unknown) {
  return PATCH(patchRequest(id, body), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/players/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("updates fields and returns the patched player", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { name: "Renamed", username: "renamed" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { username: string; name: string };
    expect(body.name).toBe("Renamed");
    expect(body.username).toBe("renamed");
    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(1);
  });

  it("normalises username to lowercase", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "AliceSmith" });
    expect(res.status).toBe(200);
    const row = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.username).toBe("alicesmith");
  });

  it("returns 400 for an empty body", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_fields");
  });

  it("returns 400 for an invalid username regex", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "AB" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const u = await makeUser();
    authMock.mockResolvedValue({
      user: { id: u.id, isAdmin: false, email: u.email, name: u.name },
    });
    const res = await call(u.id, { name: "X" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown player", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 409 username_taken on collision", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Taken", email: "tt@x", passwordHash: "x", username: "alice" },
    });
    const target = await makeUser(2);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "alice" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("username_taken");
  });

  it("returns 409 email_taken on collision", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Taken", email: "taken@x", passwordHash: "x" },
    });
    const target = await makeUser(2);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { email: "taken@x" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("email_taken");
  });

  it("returns 409 last_admin when demoting the only admin", async () => {
    const onlyAdmin = await makeAdmin();
    authMock.mockResolvedValue({
      user: {
        id: onlyAdmin.id,
        isAdmin: true,
        email: onlyAdmin.email,
        name: onlyAdmin.name,
      },
    });
    const res = await call(onlyAdmin.id, { isAdmin: false });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("last_admin");
  });
});
