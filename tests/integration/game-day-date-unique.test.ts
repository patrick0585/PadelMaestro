import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay, GameDayDateExistsError } from "@/lib/game-day/create";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/game-days/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

describe("createGameDay — unique date constraint", () => {
  beforeEach(resetDb);

  it("throws GameDayDateExistsError when a day for the same date already exists", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);

    await expect(createGameDay(new Date("2026-04-21"), admin.id)).rejects.toBeInstanceOf(
      GameDayDateExistsError,
    );
  });

  it("allows different dates in the same season", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);
    await expect(createGameDay(new Date("2026-04-22"), admin.id)).resolves.toBeDefined();
  });
});

function postReq(body: unknown) {
  return new Request("http://localhost/api/game-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/game-days — duplicate date", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 409 date_exists when the date is taken", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);

    const res = await POST(postReq({ date: "2026-04-21" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "date_exists" });
  });
});
