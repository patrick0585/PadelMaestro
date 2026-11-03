import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";
import { buildAccountExport } from "@/lib/account/export";
import { PlayerNotFoundError } from "@/lib/players/errors";

beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const g1 = await createTestGroup("Alpha");
  const g2 = await createTestGroup("Beta");
  const me = await createMember(g1.id, {
    name: "Me",
    email: "me@example.com",
    username: "meme",
  });
  const removedAt = new Date("2026-05-01T10:00:00Z");
  await prisma.membership.create({
    data: { groupId: g2.id, playerId: me.id, role: "admin", removedAt },
  });
  const p2 = await createMember(g1.id, { name: "Partner", email: "p2@example.com" });
  const p3 = await createMember(g1.id, { name: "Gegner Eins", email: "p3@example.com" });
  const p4 = await createMember(g1.id, { name: "Gegner Zwei", email: "p4@example.com" });
  const season = await createTestSeason(g1.id, { name: "Saison X" });
  const day = await createTestGameDay(g1.id, season.id, {
    date: new Date("2026-06-10T00:00:00Z"),
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: day.id, playerId: me.id, attendance: "confirmed" },
  });
  await prisma.match.create({
    data: {
      gameDayId: day.id,
      matchNumber: 1,
      team1PlayerAId: p3.id,
      team1PlayerBId: p4.id,
      team2PlayerAId: p2.id,
      team2PlayerBId: me.id,
      team1Score: 3,
      team2Score: 6,
    },
  });
  await prisma.jokerUse.create({
    data: {
      playerId: me.id,
      seasonId: season.id,
      gameDayId: day.id,
      ppgAtUse: "1.234",
      gamesCredited: 15,
      pointsCredited: "18.50",
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: me.id,
      groupId: g1.id,
      action: "x.mine",
      entityType: "Player",
      entityId: me.id,
      payload: { a: 1 },
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: p2.id,
      groupId: g1.id,
      action: "x.about-me",
      entityType: "Player",
      entityId: me.id,
    },
  });
  return { g1, g2, me, p2, p3, p4, day };
}

describe("buildAccountExport", () => {
  it("collects account, memberships (incl. removed), participations, matches with partner names, jokers, own audit rows and the avatar as base64", async () => {
    const { me } = await setup();
    const bytes = Buffer.from([1, 2, 3, 250, 251]);
    await prisma.player.update({
      where: { id: me.id },
      data: { avatarData: bytes, avatarMimeType: "image/png", avatarVersion: 1 },
    });

    const out = await buildAccountExport(me.id);

    expect(new Date(out.exportedAt).toString()).not.toBe("Invalid Date");
    expect(out.account).toEqual({
      id: me.id,
      name: "Me",
      email: "me@example.com",
      username: "meme",
      createdAt: me.createdAt.toISOString(),
    });
    expect(out.memberships).toHaveLength(2);
    expect(out.memberships.map((m) => m.group)).toEqual(["Alpha", "Beta"]);
    expect(out.memberships[0]).toMatchObject({ role: "member", removedAt: null });
    expect(out.memberships[1]).toMatchObject({
      role: "admin",
      removedAt: "2026-05-01T10:00:00.000Z",
    });
    expect(out.participations).toEqual([
      { date: "2026-06-10T00:00:00.000Z", group: "Alpha", attendance: "confirmed" },
    ]);
    expect(out.matches).toEqual([
      {
        date: "2026-06-10T00:00:00.000Z",
        group: "Alpha",
        matchNumber: 1,
        team1: ["Gegner Eins", "Gegner Zwei"],
        team2: ["Partner", "Me"],
        team1Score: 3,
        team2Score: 6,
      },
    ]);
    expect(out.jokers).toEqual([
      {
        date: "2026-06-10T00:00:00.000Z",
        group: "Alpha",
        season: "Saison X",
        pointsCredited: "18.5",
        gamesCredited: 15,
      },
    ]);
    expect(out.auditLogs).toHaveLength(1);
    expect(out.auditLogs[0]).toMatchObject({
      action: "x.mine",
      entityType: "Player",
      entityId: me.id,
      payload: { a: 1 },
    });
    expect(out.avatar?.mimeType).toBe("image/png");
    expect(Buffer.from(out.avatar!.base64, "base64").equals(bytes)).toBe(true);
  });

  it("omits audit rows where the person is only the entity, and other players' ids", async () => {
    const { me, p2, p3, p4 } = await setup();
    const out = await buildAccountExport(me.id);
    expect(out.auditLogs.map((a) => a.action)).toEqual(["x.mine"]);
    const json = JSON.stringify(out);
    for (const id of [p2.id, p3.id, p4.id]) expect(json).not.toContain(id);
    expect(out.avatar).toBeNull();
  });

  it("throws PlayerNotFoundError for a deleted account", async () => {
    const { me } = await setup();
    await expect(buildAccountExport("does-not-exist")).rejects.toBeInstanceOf(
      PlayerNotFoundError,
    );
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(buildAccountExport(me.id)).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
