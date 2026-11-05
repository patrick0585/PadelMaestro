import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
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
import { POST } from "@/app/api/game-days/route";
import { PATCH } from "@/app/api/game-days/[id]/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function postReq(body: unknown) {
  return new Request("http://localhost/api/game-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(id: string, body: unknown) {
  const req = new Request(`http://localhost/api/game-days/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

describe("Anpfiff-Uhrzeit am Spieltag", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("POST speichert die Uhrzeit", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);

    const res = await POST(postReq({ date: "2026-11-12", startTime: "18:00" }));

    expect(res.status).toBe(201);
    const day = await prisma.gameDay.findFirstOrThrow();
    expect(day.startTime).toBe("18:00");
  });

  it("POST ohne Uhrzeit lässt das Feld leer", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);

    const res = await POST(postReq({ date: "2026-11-12" }));

    expect(res.status).toBe(201);
    expect((await prisma.gameDay.findFirstOrThrow()).startTime).toBeNull();
  });

  it("POST mit ungültiger Uhrzeit gibt 400", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValue(session);

    const res = await POST(postReq({ date: "2026-11-12", startTime: "25:00" }));

    expect(res.status).toBe(400);
    expect(await prisma.gameDay.count()).toBe(0);
  });

  it("PATCH setzt und entfernt die Uhrzeit und schreibt ein Audit-Log", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id);
    authMock.mockResolvedValue(session);

    const set = await patch(day.id, { startTime: "19:30" });
    expect(set.status).toBe(200);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } })).startTime).toBe("19:30");

    const clear = await patch(day.id, { startTime: null });
    expect(clear.status).toBe(200);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } })).startTime).toBeNull();

    const logs = await prisma.auditLog.findMany({
      where: { action: "game_day.start_time", entityId: day.id },
    });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.actorId === admin.id && l.groupId === group.id)).toBe(true);
  });

  it("PATCH mit ungültiger Uhrzeit gibt 400", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id);
    authMock.mockResolvedValue(session);

    expect((await patch(day.id, { startTime: "18.00" })).status).toBe(400);
    expect((await patch(day.id, {})).status).toBe(400);
  });

  it("PATCH gibt 409, wenn der Spieltag schon läuft", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id, {
      status: "in_progress",
    });
    authMock.mockResolvedValue(session);

    const res = await patch(day.id, { startTime: "18:00" });

    expect(res.status).toBe(409);
  });

  it("PATCH gibt 403 für Mitglieder", async () => {
    const { group } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id);
    const member = await createMember(group.id, { name: "M", email: "m@x" });
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));

    expect((await patch(day.id, { startTime: "18:00" })).status).toBe(403);
  });

  it("PATCH gibt 404 für Spieltage anderer Gruppen", async () => {
    const { session } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createTestGameDay(other.id, (await createTestSeason(other.id)).id);
    authMock.mockResolvedValue(session);

    expect((await patch(foreign.id, { startTime: "18:00" })).status).toBe(404);
    expect((await prisma.gameDay.findUniqueOrThrow({ where: { id: foreign.id } })).startTime).toBeNull();
  });
});
