import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, GET } from "@/app/api/players/route";
import { createGameDay } from "@/lib/game-day/create";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "a@example.com", isAdmin: true, passwordHash: "x" },
  });
}

function asAdmin(id: string) {
  authMock.mockResolvedValue({ user: { id, isAdmin: true, email: "a@example.com", name: "Admin" } });
}
function asNonAdmin(id: string) {
  authMock.mockResolvedValue({ user: { id, isAdmin: false, email: "u@example.com", name: "User" } });
}

describe("POST /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("creates a player when admin", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "new@example.com",
        name: "Newbie",
        password: "hunter22extra",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new@example.com");
  });

  it("returns 403 for non-admin", async () => {
    const admin = await makeAdmin();
    const other = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    void admin;
    asNonAdmin(other.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "x@example.com", name: "X", password: "pass1234" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for short password", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "x@example.com", name: "X", password: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("attaches the new player to every planned game day as pending", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "late@example.com", name: "Late", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: body.id } },
    });
    expect(p).not.toBeNull();
    expect(p?.attendance).toBe("pending");
  });

  it("does not attach to locked or finished game days", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "roster_locked" },
    });
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "late@example.com", name: "Late", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: body.id } },
    });
    expect(p).toBeNull();
  });

  it("returns 409 for duplicate email", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const firstReq = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "dup@example.com", name: "A", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(firstReq)).status).toBe(201);
    const secondReq = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "dup@example.com", name: "B", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(secondReq)).status).toBe(409);
  });
});

describe("GET /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns all non-deleted players with hasPassword flag", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Historical", email: "h@example.com", passwordHash: null },
    });
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ email: string; hasPassword: boolean }>;
    const historical = body.find((p) => p.email === "h@example.com");
    expect(historical?.hasPassword).toBe(false);
    const self = body.find((p) => p.email === "a@example.com");
    expect(self?.hasPassword).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const u = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    asNonAdmin(u.id);
    const req = new Request("http://localhost/api/players", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
