import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  deletePlayer,
  PlayerNotFoundError,
  SelfDeleteError,
  LastAdminError,
  ActiveParticipationError,
} from "@/lib/players/delete";
import { resetDb } from "../helpers/reset-db";

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: { name: `Admin${i}`, email: `a${i}@x`, passwordHash: "x", isAdmin: true },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}
let dayCounter = 0;
async function makeSeasonAndDay(
  status: "planned" | "roster_locked" | "in_progress" | "finished",
) {
  const year = new Date().getFullYear();
  const season =
    (await prisma.season.findFirst({ where: { year } })) ??
    (await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    }));
  dayCounter += 1;
  const date = new Date(`${year}-01-01`);
  date.setUTCDate(date.getUTCDate() + dayCounter);
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date, status, playerCount: 4 },
  });
  return { season, day };
}

describe("deletePlayer", () => {
  beforeEach(async () => {
    await resetDb();
    dayCounter = 0;
  });

  it("soft-deletes an active player and writes an audit log", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    await deletePlayer({ playerId: target.id, actorId: admin.id });

    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.delete" },
    });
    expect(audit).toHaveLength(1);
    const payload = audit[0].payload as { name: string; email: string };
    expect(payload.name).toBe(target.name);
    expect(payload.email).toBe(target.email);
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const admin = await makeAdmin();
    await expect(
      deletePlayer({ playerId: "00000000-0000-0000-0000-000000000000", actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for already-deleted player", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await prisma.player.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await expect(
      deletePlayer({ playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws SelfDeleteError when actor and target are the same", async () => {
    const admin = await makeAdmin();
    await expect(
      deletePlayer({ playerId: admin.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(SelfDeleteError);
  });

  it("throws LastAdminError when the target is the only remaining active admin", async () => {
    const soleAdmin = await makeAdmin(1);
    const actor = await makeUser(99);
    await expect(
      deletePlayer({ playerId: soleAdmin.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("allows deleting an admin when another active admin remains", async () => {
    const a1 = await makeAdmin(1);
    const a2 = await makeAdmin(2);
    await deletePlayer({ playerId: a1.id, actorId: a2.id });
    const row = await prisma.player.findUnique({ where: { id: a1.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("soft-deleted admins do not count toward the remaining-admin check", async () => {
    const active = await makeAdmin(1);
    const ghost = await makeAdmin(2);
    await prisma.player.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });
    const actor = await makeUser(99);
    await expect(
      deletePlayer({ playerId: active.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("throws ActiveParticipationError when confirmed on a non-finished day", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day } = await makeSeasonAndDay("planned");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "confirmed" },
    });
    await expect(
      deletePlayer({ playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(ActiveParticipationError);
  });

  it("throws ActiveParticipationError when joker on a non-finished day", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day } = await makeSeasonAndDay("in_progress");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "joker" },
    });
    await expect(
      deletePlayer({ playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(ActiveParticipationError);
  });

  it("allows deletion when only declined or pending on non-finished days", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day: planned } = await makeSeasonAndDay("planned");
    const { day: inProgress } = await makeSeasonAndDay("in_progress");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: planned.id, playerId: target.id, attendance: "declined" },
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: inProgress.id, playerId: target.id, attendance: "pending" },
    });
    await deletePlayer({ playerId: target.id, actorId: admin.id });
    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("allows deletion when confirmed only on finished days", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day: finished } = await makeSeasonAndDay("finished");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: finished.id, playerId: target.id, attendance: "confirmed" },
    });
    await deletePlayer({ playerId: target.id, actorId: admin.id });
    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("preserves historical matches after deletion", async () => {
    const admin = await makeAdmin();
    const p1 = await makeUser(1);
    const p2 = await makeUser(2);
    const p3 = await makeUser(3);
    const p4 = await makeUser(4);
    const { day } = await makeSeasonAndDay("finished");
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    await deletePlayer({ playerId: p1.id, actorId: admin.id });
    const match = await prisma.match.findFirst({ where: { team1PlayerAId: p1.id } });
    expect(match).not.toBeNull();
  });
});
