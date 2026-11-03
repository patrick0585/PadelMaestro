import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, GET } from "@/app/api/players/route";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGroup,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function postReq(body: unknown) {
  return new Request("http://localhost/api/players", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function makePlannedDay(groupId: string, name: string, date: string) {
  const season = await prisma.season.create({
    data: {
      groupId,
      name,
      year: 2026,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      isActive: false,
    },
  });
  return prisma.gameDay.create({
    data: { groupId, seasonId: season.id, date: new Date(date), status: "planned", playerCount: 4 },
  });
}

describe("POST /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("creates a player when admin", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({ email: "new@example.com", name: "Newbie", password: "hunter22extra" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new@example.com");
  });

  it("returns 403 for non-admin", async () => {
    const { group } = await setupGroupWithAdmin();
    const member = await createMember(group.id, { name: "U", email: "u@example.com" });
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));
    const res = await POST(postReq({ email: "x@example.com", name: "X", password: "pass1234" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(postReq({ email: "x@example.com", name: "X", password: "pass1234" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a session without a group", async () => {
    const player = await prisma.player.create({
      data: { name: "Loner", email: "loner@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue(sessionFor(player, null, null));
    const res = await POST(postReq({ email: "x@example.com", name: "X", password: "pass1234" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for a placeholder address", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({ email: "x@anonym.invalid", name: "X", password: "hunter22extra" }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.player.count({ where: { email: "x@anonym.invalid" } })).toBe(0);
  });

  it("returns 400 for short password", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await POST(postReq({ email: "x@example.com", name: "X", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("attaches the new player to every planned game day as pending", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const day = await makePlannedDay(group.id, "S-own", "2026-04-21");
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({ email: "late@example.com", name: "Late", password: "hunter22extra" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: body.id } },
    });
    expect(p).not.toBeNull();
    expect(p?.attendance).toBe("pending");
  });

  it("attaches the new player only to planned game days of the own group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const foreign = await createTestGroup("Fremd");
    const ownDay = await makePlannedDay(group.id, "S-own", "2026-04-21");
    const foreignDay = await makePlannedDay(foreign.id, "S-foreign", "2026-04-21");
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({ email: "late@example.com", name: "Late", password: "hunter22extra" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const own = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: ownDay.id, playerId: body.id } },
    });
    const other = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: foreignDay.id, playerId: body.id } },
    });
    expect(own).not.toBeNull();
    expect(other).toBeNull();
  });

  it("does not attach to locked or finished game days", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const day = await makePlannedDay(group.id, "S-own", "2026-04-21");
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "in_progress" } });
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({ email: "late@example.com", name: "Late", password: "hunter22extra" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const p = await prisma.gameDayParticipant.findUnique({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: body.id } },
    });
    expect(p).toBeNull();
  });

  it("returns 409 for duplicate email", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const first = postReq({ email: "dup@example.com", name: "A", password: "hunter22extra" });
    expect((await POST(first)).status).toBe(201);
    const res = await POST(
      postReq({ email: "dup@example.com", name: "B", password: "hunter22extra" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_taken");
  });

  it("accepts an optional username and stores it lowercase", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({
        email: "alice@example.com",
        name: "Alice",
        password: "hunter22extra",
        username: "AliceSmith",
      }),
    );
    expect(res.status).toBe(201);
    const row = await prisma.player.findUniqueOrThrow({ where: { email: "alice@example.com" } });
    expect(row.username).toBe("alicesmith");
  });

  it("returns 400 when username does not match the regex", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const res = await POST(
      postReq({
        email: "bad@example.com",
        name: "Bad",
        password: "hunter22extra",
        username: "no spaces",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 with username_taken for duplicate username (case-insensitive)", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);
    const first = postReq({
      email: "first@example.com",
      name: "First",
      password: "hunter22extra",
      username: "shared",
    });
    expect((await POST(first)).status).toBe(201);
    const res = await POST(
      postReq({
        email: "second@example.com",
        name: "Second",
        password: "hunter22extra",
        username: "SHARED",
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("username_taken");
  });
});

describe("GET /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  const getReq = () => new Request("http://localhost/api/players", { method: "GET" });

  it("returns members with hasPassword flag and role", async () => {
    const { group, session } = await setupGroupWithAdmin();
    await createMember(group.id, { name: "Historical", email: "h@example.com" });
    authMock.mockResolvedValue(session);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      email: string;
      hasPassword: boolean;
      isAdmin: boolean;
      role: string;
    }>;
    const historical = body.find((p) => p.email === "h@example.com");
    expect(historical?.hasPassword).toBe(false);
    expect(historical?.role).toBe("member");
    expect(historical?.isAdmin).toBe(false);
    const self = body.find((p) => p.email === "admin@example.com");
    expect(self?.hasPassword).toBe(true);
    expect(self?.role).toBe("owner");
    expect(self?.isAdmin).toBe(true);
  });

  it("lists only active members of the session group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const foreign = await createTestGroup("Fremd");
    await createMember(group.id, { name: "Inside", email: "in@example.com" });
    await createMember(foreign.id, { name: "Outside", email: "out@example.com" });
    const removed = await createMember(group.id, { name: "Gone", email: "gone@example.com" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: removed.id } },
      data: { removedAt: new Date() },
    });
    authMock.mockResolvedValue(session);
    const res = await GET(getReq());
    const body = (await res.json()) as Array<{ email: string }>;
    const emails = body.map((p) => p.email).sort();
    expect(emails).toEqual(["admin@example.com", "in@example.com"]);
  });

  it("returns 403 for non-admin", async () => {
    const { group } = await setupGroupWithAdmin();
    const u = await createMember(group.id, { name: "U", email: "u@example.com" });
    authMock.mockResolvedValue(sessionFor(u, group.id, "member"));
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for a session without a group", async () => {
    const player = await prisma.player.create({
      data: { name: "Loner", email: "loner@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue(sessionFor(player, null, null));
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});
