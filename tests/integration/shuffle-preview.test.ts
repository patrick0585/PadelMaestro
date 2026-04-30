import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import {
  shufflePreviewSeed,
  GameDayNotPlannedError,
} from "@/lib/game-day/shuffle-preview";
import { resetDb } from "../helpers/reset-db";

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
}

describe("shufflePreviewSeed", () => {
  beforeEach(resetDb);

  it("persists a fresh seed on a planned game day and writes an audit entry", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    const { seed } = await shufflePreviewSeed(day.id, admin.id);
    expect(seed).toBeTruthy();

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.seed).toBe(seed);

    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.shuffle_preview", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].payload).toMatchObject({ seed });
  });

  it("changes the seed each call (very high probability)", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    const a = await shufflePreviewSeed(day.id, admin.id);
    const b = await shufflePreviewSeed(day.id, admin.id);
    expect(a.seed).not.toBe(b.seed);
  });

  it("rejects shuffle once Spielbetrieb is started (in_progress)", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "in_progress" },
    });

    await expect(shufflePreviewSeed(day.id, admin.id)).rejects.toBeInstanceOf(
      GameDayNotPlannedError,
    );
  });

  it("rejects shuffle on a finished day", async () => {
    const admin = await makeAdmin();
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({
      where: { id: day.id },
      data: { status: "finished" },
    });

    await expect(shufflePreviewSeed(day.id, admin.id)).rejects.toBeInstanceOf(
      GameDayNotPlannedError,
    );
  });
});
