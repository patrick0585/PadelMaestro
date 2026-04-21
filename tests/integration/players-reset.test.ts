import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { PATCH } from "@/app/api/players/[id]/password/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "a@example.com", isAdmin: true, passwordHash: "x" },
  });
}

describe("PATCH /api/players/[id]/password", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("resets the password and returns 204", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "Target", email: "t@example.com", passwordHash: "legacy" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/${target.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(204);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/unknown/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    const u = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: u.id, isAdmin: false, email: u.email, name: u.name },
    });
    const req = new Request(`http://localhost/api/players/${u.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: u.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for short password", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "T", email: "t2@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/${target.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(400);
  });
});
