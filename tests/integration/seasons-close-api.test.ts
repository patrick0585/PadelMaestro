import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/seasons/close/route";
import { getOrCreateActiveSeason } from "@/lib/season";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGroup,
  createTestSeason,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/seasons/close", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function makeAdmin() {
  const { group, session } = await setupGroupWithAdmin();
  authMock.mockResolvedValue(session);
  return group.id;
}

describe("POST /api/seasons/close", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for members", async () => {
    const group = await createTestGroup();
    const player = await createMember(group.id, { name: "P", email: "p@x" });
    await getOrCreateActiveSeason(group.id);
    authMock.mockResolvedValue(sessionFor(player, group.id, "member"));
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 without a group", async () => {
    const player = await prisma.player.create({
      data: { name: "P", email: "p@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue(sessionFor(player, null, null));
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    await makeAdmin();
    const res = await POST(req({ closedName: "A" }));
    expect(res.status).toBe(400);
  });

  it("closes the season and returns both seasons", async () => {
    const groupId = await makeAdmin();
    // Fremde Saison zuerst: ein Lookup ohne groupId würde sie treffen.
    const foreign = await createTestSeason((await createTestGroup("Andere")).id);
    const own = await getOrCreateActiveSeason(groupId);
    const res = await POST(req({ closedName: "Hinrunde 2026", nextName: "Rückrunde 2026" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closedSeason.id).toBe(own.id);
    expect(body.closedSeason.name).toBe("Hinrunde 2026");
    expect(body.newSeason.name).toBe("Rückrunde 2026");
    expect(body.newSeason.groupId).toBe(groupId);
    const untouched = await prisma.season.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(untouched.isActive).toBe(true);
  });

  it("closes only the active season of the admin's own group", async () => {
    const groupId = await makeAdmin();
    // Fremde Saison zuerst: ein Lookup ohne groupId würde sie treffen.
    const foreign = await createTestSeason((await createTestGroup("Andere")).id);
    const own = await createTestSeason(groupId);
    const res = await POST(req({ closedName: "Alt", nextName: "Neu" }));
    expect(res.status).toBe(200);
    expect((await prisma.season.findUniqueOrThrow({ where: { id: own.id } })).isActive).toBe(false);
    expect((await prisma.season.findUniqueOrThrow({ where: { id: foreign.id } })).isActive).toBe(true);
  });

  it("returns 409 open_game_days with the blocking dates", async () => {
    const groupId = await makeAdmin();
    const season = await getOrCreateActiveSeason(groupId);
    await prisma.gameDay.create({
      data: { groupId, seasonId: season.id, date: new Date("2026-07-21"), status: "planned" },
    });
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("open_game_days");
    expect(body.days).toEqual(["2026-07-21"]);
  });

  it("returns 400 invalid_names for identical names", async () => {
    const groupId = await makeAdmin();
    await getOrCreateActiveSeason(groupId);
    const res = await POST(req({ closedName: "X", nextName: "X" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_names");
  });
});
