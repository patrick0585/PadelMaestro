import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { joinGroup } from "@/lib/group/join";
import { createPlayer } from "@/lib/players/create";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";

async function setup() {
  const group = await createTestGroup();
  const season = await createTestSeason(group.id);
  const planned = await createTestGameDay(group.id, season.id, { status: "planned" });
  const finished = await createTestGameDay(group.id, season.id, {
    status: "finished",
    date: new Date("2020-01-01"),
  });
  const player = await prisma.player.create({
    data: { name: "Neu", email: "neu@example.com" },
  });
  return { group, season, planned, finished, player };
}

describe("joinGroup", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a member membership and adds the player to planned game days only", async () => {
    const { group, planned, finished, player } = await setup();
    const res = await prisma.$transaction((tx) =>
      joinGroup(tx, { groupId: group.id, playerId: player.id }),
    );
    expect(res).toEqual({ outcome: "joined" });
    const m = await prisma.membership.findUnique({
      where: { groupId_playerId: { groupId: group.id, playerId: player.id } },
    });
    expect(m?.role).toBe("member");
    expect(m?.removedAt).toBeNull();
    const parts = await prisma.gameDayParticipant.findMany({ where: { playerId: player.id } });
    expect(parts.map((p) => p.gameDayId)).toEqual([planned.id]);
    expect(parts.some((p) => p.gameDayId === finished.id)).toBe(false);
  });

  it("reactivates a removed membership with role member and a new joinedAt", async () => {
    const { group, planned, player } = await setup();
    const old = new Date("2024-01-01");
    await prisma.membership.create({
      data: {
        groupId: group.id,
        playerId: player.id,
        role: "admin",
        joinedAt: old,
        removedAt: new Date("2024-06-01"),
      },
    });
    const now = new Date("2026-11-03T10:00:00Z");
    const res = await prisma.$transaction((tx) =>
      joinGroup(tx, { groupId: group.id, playerId: player.id, now }),
    );
    expect(res).toEqual({ outcome: "reactivated" });
    const m = await prisma.membership.findUnique({
      where: { groupId_playerId: { groupId: group.id, playerId: player.id } },
    });
    expect(m?.removedAt).toBeNull();
    expect(m?.role).toBe("member");
    expect(m?.joinedAt).toEqual(now);
    const parts = await prisma.gameDayParticipant.findMany({ where: { playerId: player.id } });
    expect(parts.map((p) => p.gameDayId)).toEqual([planned.id]);
  });

  it("leaves an active membership untouched and returns already_member", async () => {
    const { group, player } = await setup();
    const joinedAt = new Date("2024-01-01");
    await prisma.membership.create({
      data: { groupId: group.id, playerId: player.id, role: "admin", joinedAt },
    });
    const res = await prisma.$transaction((tx) =>
      joinGroup(tx, { groupId: group.id, playerId: player.id }),
    );
    expect(res).toEqual({ outcome: "already_member" });
    const m = await prisma.membership.findUnique({
      where: { groupId_playerId: { groupId: group.id, playerId: player.id } },
    });
    expect(m?.role).toBe("admin");
    expect(m?.joinedAt).toEqual(joinedAt);
    expect(await prisma.gameDayParticipant.count({ where: { playerId: player.id } })).toBe(0);
  });
});

describe("createPlayer planned game days", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("still adds new players to planned game days", async () => {
    const { group, planned, finished } = await setup();
    const actor = await createMember(group.id, { name: "A", email: "a@example.com", role: "owner" });
    const created = await createPlayer({
      email: "x@example.com",
      name: "X",
      password: "passwort-12345",
      isAdmin: false,
      actorId: actor.id,
      groupId: group.id,
    });
    const parts = await prisma.gameDayParticipant.findMany({ where: { playerId: created.id } });
    expect(parts.map((p) => p.gameDayId)).toEqual([planned.id]);
    expect(parts.some((p) => p.gameDayId === finished.id)).toBe(false);
  });
});
