import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/reset-db";
import { createTestGameDay, createTestSeason, setupGroupWithAdmin } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/push/notify-finished", () => ({ notifyGameDayFinished: vi.fn(async () => {}) }));
import { auth } from "@/auth";
import { notifyGameDayFinished } from "@/lib/push/notify-finished";
import { POST } from "@/app/api/game-days/[id]/finish/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const notifyMock = notifyGameDayFinished as unknown as ReturnType<typeof vi.fn>;

describe("POST /api/game-days/[id]/finish", () => {
  beforeEach(async () => {
    await resetDb();
    authMock.mockReset();
    notifyMock.mockClear();
  });

  it("löst die Push zum Spieltag-Ende aus", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id, { status: "in_progress" });
    authMock.mockResolvedValue(session);

    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: day.id }) });

    expect(res.status).toBe(204);
    expect(notifyMock).toHaveBeenCalledWith(day.id, admin.id);
  });

  it("keine Push, wenn das Beenden scheitert", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const day = await createTestGameDay(group.id, (await createTestSeason(group.id)).id, { status: "finished" });
    authMock.mockResolvedValue(session);

    const res = await POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: day.id }) });

    expect(res.status).toBe(409);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
