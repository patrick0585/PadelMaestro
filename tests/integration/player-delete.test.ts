import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  deletePlayer,
  PlayerNotFoundError,
  SelfDeleteError,
  LastAdminError,
  ActiveParticipationError,
} from "@/lib/players/delete";
import { OwnerProtectedError } from "@/lib/players/owner-protected-error";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, setupGroupWithAdmin } from "../helpers/group";

let dayCounter = 0;
async function makeSeasonAndDay(
  group: { id: string },
  status: "planned" | "in_progress" | "finished",
) {
  const year = new Date().getFullYear();
  const season =
    (await prisma.season.findFirst({ where: { year, groupId: group.id } })) ??
    (await prisma.season.create({
      data: {
        name: `Saison ${year} ${group.id}`,
        groupId: group.id,
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
    data: { seasonId: season.id, groupId: group.id, date, status, playerCount: 4 },
  });
  return { season, day };
}

async function removedAtOf(groupId: string, playerId: string) {
  const m = await prisma.membership.findUniqueOrThrow({
    where: { groupId_playerId: { groupId, playerId } },
  });
  return m.removedAt;
}

describe("deletePlayer", () => {
  beforeEach(async () => {
    await resetDb();
    dayCounter = 0;
  });

  it("sets removedAt on the group membership, leaves deletedAt null, and writes an audit log", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });

    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id });

    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).toBeNull();
    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: target.id } },
    });
    expect(m.removedAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.delete" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].groupId).toBe(group.id);
    const payload = audit[0].payload as { name: string; email: string };
    expect(payload.name).toBe(target.name);
    expect(payload.email).toBe(target.email);
  });

  it("only ends the membership of the given group", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await prisma.membership.create({
      data: { groupId: other.id, playerId: target.id, role: "member" },
    });
    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id });
    const otherMembership = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: other.id, playerId: target.id } },
    });
    expect(otherMembership.removedAt).toBeNull();
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await expect(
      deletePlayer({
        groupId: group.id,
        playerId: "00000000-0000-0000-0000-000000000000",
        actorId: admin.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for already-deleted player", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await prisma.player.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await expect(
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for a member of another group", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const foreign = await createMember(other.id, { name: "F", email: "f@x" });
    await expect(
      deletePlayer({ groupId: group.id, playerId: foreign.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(p.deletedAt).toBeNull();
  });

  it("throws PlayerNotFoundError for an already removed member", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: target.id } },
      data: { removedAt: new Date() },
    });
    await expect(
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws SelfDeleteError when actor and target are the same", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    await expect(
      deletePlayer({ groupId: group.id, playerId: admin.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(SelfDeleteError);
  });

  it("throws LastAdminError when no other admin/owner remains in the group", async () => {
    const { group, admin: soleAdmin } = await setupGroupWithAdmin("admin");
    const actor = await createMember(group.id, { name: "Actor", email: "actor@x" });
    const other = await createTestGroup("Andere");
    await createMember(other.id, { name: "Fremd", email: "fremd@x", role: "admin" });
    await expect(
      deletePlayer({ groupId: group.id, playerId: soleAdmin.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
    const row = await prisma.player.findUniqueOrThrow({ where: { id: soleAdmin.id } });
    expect(row.deletedAt).toBeNull();
  });

  it("allows removing the only admin when an owner exists", async () => {
    const { group, admin: owner } = await setupGroupWithAdmin("owner");
    const admin = await createMember(group.id, { name: "A2", email: "a2@x", role: "admin" });
    await deletePlayer({ groupId: group.id, playerId: admin.id, actorId: owner.id });
    expect(await removedAtOf(group.id, admin.id)).not.toBeNull();
  });

  it("allows removing a plain member when the deleter is the only admin", async () => {
    const { group, admin: soleAdmin } = await setupGroupWithAdmin("admin");
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: soleAdmin.id });
    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: target.id } },
    });
    expect(m.removedAt).not.toBeNull();
  });

  it("allows removing an admin when another admin remains", async () => {
    const { group, admin: a1 } = await setupGroupWithAdmin("admin");
    const a2 = await createMember(group.id, { name: "A2", email: "a2@x", role: "admin" });
    await deletePlayer({ groupId: group.id, playerId: a1.id, actorId: a2.id });
    expect(await removedAtOf(group.id, a1.id)).not.toBeNull();
  });

  it("removed admins do not count toward the remaining-admin check", async () => {
    const { group, admin: active } = await setupGroupWithAdmin("admin");
    const ghost = await createMember(group.id, { name: "Ghost", email: "ghost@x", role: "admin" });
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: ghost.id } },
      data: { removedAt: new Date() },
    });
    const actor = await createMember(group.id, { name: "Actor", email: "actor@x" });
    await expect(
      deletePlayer({ groupId: group.id, playerId: active.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("throws ActiveParticipationError when confirmed on a non-finished day", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const { day } = await makeSeasonAndDay(group, "planned");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "confirmed" },
    });
    await expect(
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(ActiveParticipationError);
  });

  it("throws ActiveParticipationError when joker on a non-finished day", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const { day } = await makeSeasonAndDay(group, "in_progress");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "joker" },
    });
    await expect(
      deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(ActiveParticipationError);
  });

  it("ignores confirmed participation on game days of another group", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const other = await createTestGroup("Andere");
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const { day } = await makeSeasonAndDay(other, "planned");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "confirmed" },
    });
    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id });
    expect(await removedAtOf(group.id, target.id)).not.toBeNull();
  });

  it("allows deletion when only declined or pending on non-finished days", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const { day: planned } = await makeSeasonAndDay(group, "planned");
    const { day: inProgress } = await makeSeasonAndDay(group, "in_progress");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: planned.id, playerId: target.id, attendance: "declined" },
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: inProgress.id, playerId: target.id, attendance: "pending" },
    });
    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id });
    expect(await removedAtOf(group.id, target.id)).not.toBeNull();
  });

  it("allows deletion when confirmed only on finished days", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "U1", email: "u1@x" });
    const { day: finished } = await makeSeasonAndDay(group, "finished");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: finished.id, playerId: target.id, attendance: "confirmed" },
    });
    await deletePlayer({ groupId: group.id, playerId: target.id, actorId: admin.id });
    expect(await removedAtOf(group.id, target.id)).not.toBeNull();
  });

  it("preserves historical matches after deletion", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const p1 = await createMember(group.id, { name: "U1", email: "u1@x" });
    const p2 = await createMember(group.id, { name: "U2", email: "u2@x" });
    const p3 = await createMember(group.id, { name: "U3", email: "u3@x" });
    const p4 = await createMember(group.id, { name: "U4", email: "u4@x" });
    const { day } = await makeSeasonAndDay(group, "finished");
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
    await deletePlayer({ groupId: group.id, playerId: p1.id, actorId: admin.id });
    const match = await prisma.match.findFirst({ where: { team1PlayerAId: p1.id } });
    expect(match).not.toBeNull();
  });

  it("rejects deleting the owner", async () => {
    const { group, admin } = await setupGroupWithAdmin("admin");
    const owner = await createMember(group.id, { name: "O", email: "o@x", role: "owner" });
    await expect(
      deletePlayer({ groupId: group.id, playerId: owner.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(OwnerProtectedError);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: owner.id } });
    expect(p.deletedAt).toBeNull();
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: owner.id } });
    expect(m.removedAt).toBeNull();
  });
});
