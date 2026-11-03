import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  createMember,
  createTestGameDay,
  createTestGroup,
  createTestSeason,
} from "../helpers/group";
import { createInvitation } from "@/lib/invitations/create";
import { joinWithInvitation, signupWithInvitation } from "@/lib/invitations/redeem";
import { InvitationInvalidError } from "@/lib/invitations/errors";
import { EmailTakenError } from "@/lib/account/errors";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";

const NOW = new Date("2026-11-03T12:00:00Z");

async function setup() {
  const group = await createTestGroup("Padelgruppe");
  const admin = await createMember(group.id, {
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    passwordHash: "x",
  });
  const link = await createInvitation(
    { kind: "member", groupId: group.id, createdById: admin.id },
    NOW,
  );
  return { group, admin, link };
}

beforeEach(async () => {
  await resetDb();
  clearMemoryOutbox();
  setTransportForTests(null);
});

afterEach(() => {
  setTransportForTests(null);
  vi.restoreAllMocks();
});

describe("signupWithInvitation", () => {
  it("signup via member link creates player with termsAcceptedAt, membership member, planned-day participation, InvitationUse, usedCount 1, audit player.signup, and one verification mail", async () => {
    const { group, link } = await setup();
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id);

    const res = await signupWithInvitation({
      token: link.token,
      name: "Neu",
      email: "neu@example.com",
      password: "geheim-genug-123",
      now: NOW,
    });

    expect(res.kind).toBe("member");
    expect(res.groupId).toBe(group.id);
    const player = await prisma.player.findUniqueOrThrow({ where: { id: res.playerId } });
    expect(player.name).toBe("Neu");
    expect(player.email).toBe("neu@example.com");
    expect(player.termsAcceptedAt).toEqual(NOW);
    expect(player.emailVerifiedAt).toBeNull();
    expect(player.passwordHash).toBeTruthy();
    const ms = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: player.id } },
    });
    expect(ms.role).toBe("member");
    expect(ms.removedAt).toBeNull();
    expect(
      await prisma.gameDayParticipant.count({ where: { gameDayId: day.id, playerId: player.id } }),
    ).toBe(1);
    const uses = await prisma.invitationUse.findMany({ where: { invitationId: link.id } });
    expect(uses).toHaveLength(1);
    expect(uses[0].playerId).toBe(player.id);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);
    const audit = await prisma.auditLog.findMany({ where: { action: "player.signup" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(player.id);
    expect(audit[0].groupId).toBe(group.id);
    expect(audit[0].payload).toEqual({ invitationId: link.id, kind: "member" });
    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("neu@example.com");
  });

  it("signup via founder link creates the player without membership and returns groupId null", async () => {
    const link = await createInvitation({ kind: "founder" }, NOW);
    const res = await signupWithInvitation({
      token: link.token,
      name: "Gruender",
      email: "g@example.com",
      password: "geheim-genug-123",
      now: NOW,
    });
    expect(res.kind).toBe("founder");
    expect(res.groupId).toBeNull();
    expect(await prisma.membership.count({ where: { playerId: res.playerId } })).toBe(0);
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "player.signup" } });
    expect(audit.groupId).toBeNull();
    expect(audit.payload).toEqual({ invitationId: link.id, kind: "founder" });
  });

  it("signup lowercases the email and rejects an existing address with EmailTakenError without touching usedCount", async () => {
    const { link } = await setup();
    const ok = await signupWithInvitation({
      token: link.token,
      name: "Erst",
      email: "  Mixed@Example.COM ",
      password: "geheim-genug-123",
      now: NOW,
    });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: ok.playerId } })).email).toBe(
      "mixed@example.com",
    );
    const before = await prisma.player.count();

    await expect(
      signupWithInvitation({
        token: link.token,
        name: "Zweit",
        email: "MIXED@example.com",
        password: "geheim-genug-123",
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);

    expect(await prisma.player.count()).toBe(before);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
  });

  it("signup on an exhausted link throws exhausted and creates nothing", async () => {
    const { link } = await setup();
    await prisma.invitation.update({ where: { id: link.id }, data: { maxUses: 1, usedCount: 1 } });
    const before = await prisma.player.count();

    const err = await signupWithInvitation({
      token: link.token,
      name: "Spaet",
      email: "spaet@example.com",
      password: "geheim-genug-123",
      now: NOW,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(InvitationInvalidError);
    expect(err.reason).toBe("exhausted");
    expect(await prisma.player.count()).toBe(before);
    expect(await prisma.invitationUse.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "player.signup" } })).toBe(0);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("two concurrent signups on a link with one free use: exactly one succeeds, usedCount equals maxUses", async () => {
    const link = await createInvitation({ kind: "founder" }, NOW);
    const before = await prisma.player.count();

    const results = await Promise.allSettled(
      ["a@example.com", "b@example.com"].map((email) =>
        signupWithInvitation({
          token: link.token,
          name: "Rennen",
          email,
          password: "geheim-genug-123",
          now: NOW,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toBeInstanceOf(InvitationInvalidError);
    expect(bad[0].reason.reason).toBe("exhausted");
    const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } });
    expect(inv.usedCount).toBe(inv.maxUses);
    expect(inv.usedCount).toBe(1);
    expect(await prisma.player.count()).toBe(before + 1);
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
  });

  it("signup succeeds with 201 semantics when the mail transport throws (player exists, no mail)", async () => {
    const { link } = await setup();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setTransportForTests({
      send: async () => {
        throw new Error("smtp down");
      },
    });

    const res = await signupWithInvitation({
      token: link.token,
      name: "Neu",
      email: "neu@example.com",
      password: "geheim-genug-123",
      now: NOW,
    });

    expect(await prisma.player.findUnique({ where: { id: res.playerId } })).not.toBeNull();
    expect(memoryOutbox).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith("[signup] verification mail failed", expect.anything());
  });
});

describe("joinWithInvitation", () => {
  it("joinWithInvitation joins an existing account, reactivates a removed membership, and reports already_member without a second InvitationUse", async () => {
    const { group, link } = await setup();
    const other = await createTestGroup("Andere");
    const me = await createMember(other.id, { name: "Ich", email: "ich@example.com" });

    const first = await joinWithInvitation({ token: link.token, playerId: me.id, now: NOW });
    expect(first).toEqual({ kind: "member", groupId: group.id, outcome: "joined" });
    expect(
      (
        await prisma.membership.findUniqueOrThrow({
          where: { groupId_playerId: { groupId: group.id, playerId: me.id } },
        })
      ).role,
    ).toBe("member");
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);
    const audit = await prisma.auditLog.findMany({ where: { action: "membership.join" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(me.id);
    expect(audit[0].groupId).toBe(group.id);
    expect(audit[0].payload).toEqual({ invitationId: link.id, outcome: "joined" });

    const again = await joinWithInvitation({ token: link.token, playerId: me.id, now: NOW });
    expect(again).toEqual({ kind: "member", groupId: group.id, outcome: "already_member" });
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "membership.join" } })).toBe(1);

    // removed membership, second link, reactivation
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: me.id } },
      data: { removedAt: NOW },
    });
    const admin = await prisma.player.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const link2 = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id },
      NOW,
    );
    const re = await joinWithInvitation({ token: link2.token, playerId: me.id, now: NOW });
    expect(re).toEqual({ kind: "member", groupId: group.id, outcome: "reactivated" });
    const ms = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: me.id } },
    });
    expect(ms.removedAt).toBeNull();
    expect(await prisma.invitationUse.count({ where: { invitationId: link2.id } })).toBe(1);
  });

  it("joinWithInvitation on a founder link records a use once and is idempotent for the same account", async () => {
    const group = await createTestGroup();
    const me = await createMember(group.id, { name: "Ich", email: "ich@example.com" });
    const link = await createInvitation({ kind: "founder" }, NOW);

    const first = await joinWithInvitation({ token: link.token, playerId: me.id, now: NOW });
    expect(first).toEqual({ kind: "founder", outcome: "redeemed" });
    const use = await prisma.invitationUse.findFirstOrThrow({ where: { invitationId: link.id } });
    expect(use.playerId).toBe(me.id);
    expect(use.foundedGroupId).toBeNull();
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);

    // link is now exhausted (maxUses 1); the same account still gets an idempotent answer
    const again = await joinWithInvitation({ token: link.token, playerId: me.id, now: NOW });
    expect(again).toEqual({ kind: "founder", outcome: "already_redeemed" });
    expect(await prisma.invitationUse.count({ where: { invitationId: link.id } })).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: link.id } })).usedCount).toBe(1);
  });
});
