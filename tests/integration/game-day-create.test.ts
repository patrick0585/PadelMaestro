import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { getOrCreateActiveSeason } from "@/lib/season";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
  sessionFor,
  setupGroupWithAdmin,
} from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { GET, POST } from "@/app/api/game-days/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

describe("createGameDay", () => {
  beforeEach(resetDb);

  it("creates a game day with pending participants for all active members", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await createMember(group.id, { name: "B", email: "b@x" });

    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);

    expect(day.status).toBe("planned");
    const log = await prisma.auditLog.findFirst({
      where: { action: "game_day.create", entityId: day.id },
    });
    expect(log?.groupId).toBe(group.id);
    expect(log?.actorId).toBe(admin.id);
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.attendance === "pending")).toBe(true);
  });

  it("Teilnehmer sind die aktiven Mitglieder der Gruppe", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const active = await createMember(group.id, { name: "Aktiv", email: "aktiv@x" });
    const removed = await createMember(group.id, { name: "Weg", email: "weg@x" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: removed.id } },
      data: { removedAt: new Date() },
    });
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, { name: "Fremd", email: "fremd@x" });

    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);

    const ids = day.participants.map((p) => p.playerId).sort();
    expect(ids).toEqual([admin.id, active.id].sort());
    expect(ids).not.toContain(removed.id);
    expect(ids).not.toContain(foreign.id);
  });

  it("setzt groupId und die aktive Saison der Gruppe", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    await createTestSeason(other.id);

    const day = await createGameDay(group.id, new Date("2026-04-21"), admin.id);

    const season = await getOrCreateActiveSeason(group.id);
    expect(day.groupId).toBe(group.id);
    expect(day.seasonId).toBe(season.id);
  });

  it("gleiches Datum in zwei Gruppen ist erlaubt", async () => {
    const a = await setupGroupWithAdmin();
    const groupB = await createTestGroup("B");
    const adminB = await createMember(groupB.id, {
      name: "Admin B",
      email: "admin-b@x",
      role: "owner",
    });
    const date = new Date("2026-04-21");
    const dayA = await createGameDay(a.group.id, date, a.admin.id);
    const dayB = await createGameDay(groupB.id, date, adminB.id);

    expect(dayA.groupId).toBe(a.group.id);
    expect(dayB.groupId).toBe(groupB.id);
    expect(dayB.id).not.toBe(dayA.id);
    const seasons = await prisma.season.findMany({ where: { id: { in: [dayA.seasonId, dayB.seasonId] } } });
    expect(seasons.map((s) => s.name)).toEqual([`Saison ${new Date().getFullYear()}`, `Saison ${new Date().getFullYear()}`]);
  });
});

function postReq(body: unknown) {
  return new Request("http://localhost/api/game-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/game-days", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("GET listet nur Spieltage der Session-Gruppe", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const own = await createTestGameDay(group.id, (await createTestSeason(group.id)).id);
    const other = await createTestGroup("Andere");
    await createTestGameDay(other.id, (await createTestSeason(other.id)).id);
    authMock.mockResolvedValue(session);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { gameDays: { id: string }[] };
    expect(body.gameDays.map((d) => d.id)).toEqual([own.id]);
  });

  it("POST 403 für member", async () => {
    const group = await createTestGroup();
    const member = await createMember(group.id, { name: "M", email: "m@x" });
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));

    const res = await POST(postReq({ date: "2026-04-21" }));

    expect(res.status).toBe(403);
    expect(await prisma.gameDay.count()).toBe(0);
  });

  it("POST 401 ohne Session", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(postReq({ date: "2026-04-21" }));

    expect(res.status).toBe(401);
  });
});
