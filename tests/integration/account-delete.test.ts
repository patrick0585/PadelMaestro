import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";
import { hashPassword } from "@/lib/auth/hash";
import {
  AnonymisationCollisionError,
  deleteOwnAccount,
  OwnerOfGroupError,
} from "@/lib/account/delete";
import { WrongPasswordError, PlayerNotFoundError } from "@/lib/account/errors";
import { transferOwnership } from "@/lib/group/transfer";
import { createInvitation } from "@/lib/invitations/create";
import { signupWithInvitation } from "@/lib/invitations/redeem";
import { clearMemoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { computeRanking } from "@/lib/ranking/compute";

const NOW = new Date("2026-11-03T12:00:00Z");
const PASSWORD = "geheim-genug-123";

let hash: string;

beforeEach(async () => {
  await resetDb();
  clearMemoryOutbox();
  setTransportForTests(null);
  hash ??= await hashPassword(PASSWORD);
});

afterEach(() => {
  setTransportForTests(null);
});

async function setupGroup(name = "Padelgruppe") {
  const group = await createTestGroup(name);
  const owner = await createMember(group.id, {
    name: "Olga",
    email: `olga-${group.id}@example.com`,
    role: "owner",
    passwordHash: hash,
  });
  return { group, owner };
}

async function addPlayers(groupId: string, names: string[]) {
  const players = [];
  for (const name of names) {
    players.push(
      await createMember(groupId, {
        name,
        email: `${name.toLowerCase()}@example.com`,
        passwordHash: hash,
      }),
    );
  }
  return players;
}

describe("deleteOwnAccount", () => {
  it("deleteOwnAccount anonymises every Player field listed, ends all active memberships, deletes planned-day participations, keeps in-progress and finished participations and matches, deletes email tokens, keeps InvitationUse, anonymises Player audit payloads, writes account.delete", async () => {
    const { group, owner } = await setupGroup();
    const other = await createTestGroup("Andere");
    const p = await createMember(group.id, {
      name: "Paula",
      email: "paula@example.com",
      username: "paula",
      passwordHash: hash,
      emailVerifiedAt: new Date("2026-01-01"),
      activeGroupId: group.id,
    });
    await prisma.player.update({
      where: { id: p.id },
      data: {
        pendingEmail: "neu@example.com",
        avatarData: Buffer.from([1, 2, 3]),
        avatarMimeType: "image/png",
        avatarVersion: 3,
        telegramId: BigInt(123456),
      },
    });
    await prisma.membership.create({ data: { groupId: other.id, playerId: p.id, role: "admin" } });
    const oldRemoved = new Date("2026-05-01T00:00:00Z");
    const third = await createTestGroup("Alt");
    await prisma.membership.create({
      data: { groupId: third.id, playerId: p.id, role: "member", removedAt: oldRemoved },
    });

    const [a, b, c] = await addPlayers(group.id, ["Anna", "Bert", "Carl"]);
    const season = await createTestSeason(group.id);
    const planned = await createTestGameDay(group.id, season.id, {
      status: "planned",
      date: new Date("2026-12-01"),
    });
    const running = await createTestGameDay(group.id, season.id, {
      status: "in_progress",
      date: new Date("2026-11-03"),
    });
    const finished = await createTestGameDay(group.id, season.id, {
      status: "finished",
      date: new Date("2026-10-01"),
    });
    for (const day of [planned, running, finished]) {
      await prisma.gameDayParticipant.create({
        data: { gameDayId: day.id, playerId: p.id, attendance: "confirmed" },
      });
    }
    await prisma.gameDayParticipant.create({
      data: { gameDayId: planned.id, playerId: a.id, attendance: "confirmed" },
    });
    const plannedJokerDay = await createTestGameDay(group.id, season.id, {
      status: "planned",
      date: new Date("2026-12-08"),
    });
    await prisma.gameDayParticipant.create({
      data: { gameDayId: plannedJokerDay.id, playerId: p.id, attendance: "joker" },
    });
    for (const day of [plannedJokerDay, finished]) {
      await prisma.jokerUse.create({
        data: {
          playerId: p.id,
          seasonId: season.id,
          gameDayId: day.id,
          ppgAtUse: "1.500",
          pointsCredited: "22.50",
        },
      });
    }
    for (const day of [running, finished]) {
      await prisma.match.create({
        data: {
          gameDayId: day.id,
          matchNumber: 1,
          team1PlayerAId: p.id,
          team1PlayerBId: a.id,
          team2PlayerAId: b.id,
          team2PlayerBId: c.id,
          team1Score: 3,
          team2Score: 1,
        },
      });
    }
    await prisma.emailToken.create({
      data: {
        playerId: p.id,
        purpose: "verify_email",
        tokenHash: "hash-verify",
        email: "paula@example.com",
        expiresAt: new Date("2026-12-01"),
      },
    });
    await prisma.emailToken.create({
      data: {
        playerId: p.id,
        purpose: "password_reset",
        tokenHash: "hash-reset",
        email: "paula@example.com",
        expiresAt: new Date("2026-12-01"),
      },
    });
    const inv = await createInvitation(
      { kind: "member", groupId: group.id, createdById: owner.id },
      NOW,
    );
    await prisma.invitationUse.create({ data: { invitationId: inv.id, playerId: p.id } });
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        groupId: group.id,
        action: "player.update",
        entityType: "Player",
        entityId: p.id,
        payload: { name: "Paula", email: "paula@example.com" },
      },
    });
    const foreign = await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        groupId: group.id,
        action: "player.update",
        entityType: "Player",
        entityId: a.id,
        payload: { name: "Anna" },
      },
    });

    await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW });

    const after = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.name).toBe("Gelöschter Spieler");
    expect(after.email).toBe(`geloescht-${p.id}@anonym.invalid`);
    expect(after.username).toBeNull();
    expect(after.passwordHash).toBeNull();
    expect(after.pendingEmail).toBeNull();
    expect(after.emailVerifiedAt).toBeNull();
    expect(after.avatarData).toBeNull();
    expect(after.avatarMimeType).toBeNull();
    expect(after.avatarVersion).toBe(0);
    expect(after.telegramId).toBeNull();
    expect(after.activeGroupId).toBeNull();
    expect(after.deletedAt).toEqual(NOW);
    expect(after.sessionVersion).toBe(p.sessionVersion + 1);

    const memberships = await prisma.membership.findMany({
      where: { playerId: p.id },
      orderBy: { groupId: "asc" },
    });
    expect(memberships).toHaveLength(3);
    const byGroup = new Map(memberships.map((m) => [m.groupId, m.removedAt]));
    expect(byGroup.get(group.id)).toEqual(NOW);
    expect(byGroup.get(other.id)).toEqual(NOW);
    expect(byGroup.get(third.id)).toEqual(oldRemoved);

    const parts = await prisma.gameDayParticipant.findMany({ where: { playerId: p.id } });
    expect(parts.map((x) => x.gameDayId).sort()).toEqual([running.id, finished.id].sort());
    expect(
      await prisma.gameDayParticipant.count({ where: { gameDayId: planned.id, playerId: a.id } }),
    ).toBe(1);
    expect(
      await prisma.match.count({ where: { team1PlayerAId: p.id, gameDayId: { in: [running.id, finished.id] } } }),
    ).toBe(2);

    const jokers = await prisma.jokerUse.findMany({ where: { playerId: p.id } });
    expect(jokers.map((j) => j.gameDayId)).toEqual([finished.id]);

    expect(await prisma.emailToken.count({ where: { playerId: p.id } })).toBe(0);
    expect(await prisma.invitationUse.count({ where: { playerId: p.id } })).toBe(1);

    const playerLogs = await prisma.auditLog.findMany({
      where: { entityType: "Player", entityId: p.id, action: { not: "account.delete" } },
    });
    expect(playerLogs).toHaveLength(1);
    expect(playerLogs[0].payload).toEqual({ anonymised: true });
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: foreign.id } })).payload).toEqual({
      name: "Anna",
    });

    const del = await prisma.auditLog.findMany({ where: { action: "account.delete" } });
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({
      actorId: p.id,
      groupId: null,
      entityType: "Player",
      entityId: p.id,
      payload: null,
    });
  });

  it("deleteOwnAccount rejects wrong password and passwordless accounts without changes", async () => {
    const { group } = await setupGroup();
    const p = await createMember(group.id, {
      name: "Paula",
      email: "paula@example.com",
      passwordHash: hash,
    });
    const noPw = await createMember(group.id, {
      name: "Nina",
      email: "nina@example.com",
      passwordHash: null,
    });
    const snapshot = async () => ({
      players: await prisma.player.findMany({ orderBy: { id: "asc" } }),
      memberships: await prisma.membership.findMany({ orderBy: { id: "asc" } }),
      audit: await prisma.auditLog.count(),
    });
    const before = await snapshot();

    await expect(
      deleteOwnAccount({ playerId: p.id, password: "falsch", now: NOW }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      deleteOwnAccount({ playerId: noPw.id, password: "egal", now: NOW }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      deleteOwnAccount({ playerId: "00000000-0000-0000-0000-000000000000", password: PASSWORD, now: NOW }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);

    expect(await snapshot()).toEqual(before);

    await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW });
    await expect(
      deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("owner of A and member of B → OwnerOfGroupError with [A]; after transferOwnership the deletion succeeds and ends both memberships", async () => {
    const groupA = await createTestGroup("Alpha");
    const groupB = await createTestGroup("Beta");
    const p = await createMember(groupA.id, {
      name: "Paula",
      email: "paula@example.com",
      role: "owner",
      passwordHash: hash,
    });
    await prisma.membership.create({ data: { groupId: groupB.id, playerId: p.id, role: "member" } });
    await createMember(groupB.id, {
      name: "Bodo",
      email: "bodo@example.com",
      role: "owner",
      passwordHash: hash,
    });
    const heir = await createMember(groupA.id, {
      name: "Hans",
      email: "hans@example.com",
      passwordHash: hash,
    });
    const auditBefore = await prisma.auditLog.count();

    const err = await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(OwnerOfGroupError);
    expect((err as OwnerOfGroupError).groups).toEqual([{ id: groupA.id, name: "Alpha" }]);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).toBeNull();
    expect(await prisma.membership.count({ where: { playerId: p.id, removedAt: null } })).toBe(2);
    expect(await prisma.auditLog.count()).toBe(auditBefore);

    await transferOwnership({ groupId: groupA.id, actorId: p.id, newOwnerId: heir.id });
    await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW });

    const ms = await prisma.membership.findMany({ where: { playerId: p.id } });
    expect(ms).toHaveLength(2);
    expect(ms.every((m) => m.removedAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("lists every owned group sorted by name", async () => {
    const groupZ = await createTestGroup("Zeta");
    const groupA = await createTestGroup("Alpha");
    const p = await createMember(groupZ.id, {
      name: "Paula",
      email: "paula@example.com",
      role: "owner",
      passwordHash: hash,
    });
    await prisma.membership.create({ data: { groupId: groupA.id, playerId: p.id, role: "owner" } });
    const err = await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW }).catch(
      (e: unknown) => e,
    );
    expect((err as OwnerOfGroupError).groups).toEqual([
      { id: groupA.id, name: "Alpha" },
      { id: groupZ.id, name: "Zeta" },
    ]);
  });

  it("after deletion the same e-mail can sign up again via an invitation link; the old account stays anonymised", async () => {
    const { group, owner } = await setupGroup();
    const p = await createMember(group.id, {
      name: "Paula",
      email: "paula@example.com",
      passwordHash: hash,
    });
    await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW });

    const link = await createInvitation(
      { kind: "member", groupId: group.id, createdById: owner.id },
      NOW,
    );
    const res = await signupWithInvitation({
      token: link.token,
      name: "Paula",
      email: "paula@example.com",
      password: PASSWORD,
      now: NOW,
    });
    expect(res.playerId).not.toBe(p.id);

    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: res.playerId } });
    expect(fresh.email).toBe("paula@example.com");
    expect(fresh.deletedAt).toBeNull();
    const old = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
    expect(old.name).toBe("Gelöschter Spieler");
    expect(old.email).toBe(`geloescht-${p.id}@anonym.invalid`);
    expect(old.deletedAt).toEqual(NOW);
  });

  it("game-day summary shows 'Gelöschter Spieler' for the anonymised player; ranking excludes them", async () => {
    const { group } = await setupGroup();
    const [p, a, b, c] = await addPlayers(group.id, ["Paula", "Anna", "Bert", "Carl"]);
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id, {
      status: "finished",
      date: new Date("2026-10-01"),
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p.id,
        team1PlayerBId: a.id,
        team2PlayerAId: b.id,
        team2PlayerBId: c.id,
        team1Score: 3,
        team2Score: 1,
      },
    });
    expect((await computeRanking(season.id)).map((r) => r.playerId)).toContain(p.id);

    await deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW });

    const summary = await computeGameDaySummary(day.id);
    const row = summary?.rows.find((r) => r.playerId === p.id);
    expect(row?.playerName).toBe("Gelöschter Spieler");
    expect(row?.avatarVersion).toBe(0);
    expect(summary?.podium.map((r) => r.playerName)).toContain("Gelöschter Spieler");

    const ranking = await computeRanking(season.id);
    expect(ranking.map((r) => r.playerId)).not.toContain(p.id);
    expect(ranking.map((r) => r.playerId).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("anonymisation e-mail collision throws AnonymisationCollisionError and leaves the account unchanged", async () => {
    const { group } = await setupGroup();
    const p = await createMember(group.id, {
      name: "Paula",
      email: "paula@example.com",
      passwordHash: hash,
    });
    await prisma.player.create({
      data: { name: "Blocker", email: `geloescht-${p.id}@anonym.invalid` },
    });
    const snapshot = async () => ({
      player: await prisma.player.findUniqueOrThrow({ where: { id: p.id } }),
      memberships: await prisma.membership.findMany({ where: { playerId: p.id } }),
      audit: await prisma.auditLog.count(),
    });
    const before = await snapshot();

    await expect(
      deleteOwnAccount({ playerId: p.id, password: PASSWORD, now: NOW }),
    ).rejects.toBeInstanceOf(AnonymisationCollisionError);
    expect(await snapshot()).toEqual(before);
  });

});
