import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "@/app/api/game-days/[id]/route";
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
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup(status: "planned" | "in_progress" | "finished") {
  const { group, admin, session } = await setupGroupWithAdmin();
  const season = await createTestSeason(group.id);
  const day = await createTestGameDay(group.id, season.id, {
    date: new Date("2026-04-21"),
    status,
  });
  authMock.mockResolvedValue(session);
  return { group, admin, day };
}

function delReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}`, { method: "DELETE" });
}
async function call(id: string) {
  return DELETE(delReq(id), { params: Promise.resolve({ id }) });
}

describe("DELETE /api/game-days/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("deletes a planned day and returns 204", async () => {
    const { day } = await setup("planned");
    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("returns 409 for in_progress", async () => {
    const { day } = await setup("in_progress");
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 for finished", async () => {
    const { day } = await setup("finished");
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown id", async () => {
    await setup("planned");
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 404 für Spieltag einer anderen Gruppe and deletes nothing", async () => {
    const { day } = await setup("planned");
    const otherGroup = await createTestGroup("Andere");
    const otherAdmin = await createMember(otherGroup.id, {
      name: "Other",
      email: "other@example.com",
      role: "owner",
      passwordHash: "x",
    });
    authMock.mockResolvedValue(sessionFor(otherAdmin, otherGroup.id, "owner"));
    const res = await call(day.id);
    expect(res.status).toBe(404);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("returns 401 when unauthenticated", async () => {
    const { day } = await setup("planned");
    authMock.mockResolvedValue(null);
    const res = await call(day.id);
    expect(res.status).toBe(401);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("returns 403 for non-admin", async () => {
    const { group, day } = await setup("planned");
    const user = await createMember(group.id, { name: "U", email: "u@example.com", passwordHash: "x" });
    authMock.mockResolvedValue(sessionFor(user, group.id, "member"));
    const res = await call(day.id);
    expect(res.status).toBe(403);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("audit log entry persists after delete", async () => {
    const { day } = await setup("planned");
    await call(day.id);
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.delete", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });
});
