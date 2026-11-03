import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/token";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { createInvitation } from "@/lib/invitations/create";
import {
  findRedeemableInvitation,
  previewInvitation,
} from "@/lib/invitations/lookup";
import {
  listFounderInvitations,
  listOpenInvitations,
  revokeFounderInvitation,
  revokeInvitation,
} from "@/lib/invitations/manage";
import { InvitationInvalidError, InvitationNotFoundError } from "@/lib/invitations/errors";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-03T12:00:00Z");

async function setup() {
  const group = await createTestGroup("Padelgruppe");
  const admin = await createMember(group.id, {
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    passwordHash: "x",
  });
  return { group, admin };
}

async function reasonOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    if (e instanceof InvitationInvalidError) return e.reason;
    throw e;
  }
  return null;
}

describe("invitations", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("createInvitation member: 14 days, maxUses 25, stores only the hash, writes audit invitation.create", async () => {
    const { group, admin } = await setup();
    const res = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id, note: "Dienstag" },
      NOW,
    );
    expect(res.expiresAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: res.id } });
    expect(row).toMatchObject({
      kind: "member",
      groupId: group.id,
      createdById: admin.id,
      note: "Dienstag",
      maxUses: 25,
      usedCount: 0,
      tokenHash: hashToken(res.token),
    });
    expect(row.tokenHash).not.toBe(res.token);
    const audit = await prisma.auditLog.findMany({ where: { action: "invitation.create" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      groupId: group.id,
      entityType: "Invitation",
      entityId: res.id,
      payload: { note: "Dienstag", expiresAt: res.expiresAt.toISOString(), maxUses: 25 },
    });
  });

  it("createInvitation founder: 30 days, maxUses 1, no groupId, no audit row", async () => {
    const res = await createInvitation({ kind: "founder", note: "Neue Gruppe" }, NOW);
    expect(res.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: res.id } });
    expect(row).toMatchObject({
      kind: "founder",
      groupId: null,
      createdById: null,
      maxUses: 1,
      tokenHash: hashToken(res.token),
    });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("findRedeemableInvitation returns the row for a fresh token", async () => {
    const { group, admin } = await setup();
    const { id, token } = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id },
      NOW,
    );
    expect(await findRedeemableInvitation(prisma, token, NOW)).toEqual({
      id,
      kind: "member",
      groupId: group.id,
      maxUses: 25,
      usedCount: 0,
    });
  });

  it("findRedeemableInvitation reports unknown for a random token", async () => {
    expect(await reasonOf(findRedeemableInvitation(prisma, "nope", NOW))).toBe("unknown");
  });

  it("findRedeemableInvitation reports revoked before expired for a link that is both", async () => {
    const { id, token } = await createInvitation({ kind: "founder" }, NOW);
    await prisma.invitation.update({
      where: { id },
      data: { revokedAt: NOW, expiresAt: new Date(NOW.getTime() - DAY), usedCount: 1 },
    });
    expect(await reasonOf(findRedeemableInvitation(prisma, token, NOW))).toBe("revoked");
  });

  it("findRedeemableInvitation reports expired at expiresAt (now === expiresAt)", async () => {
    const { token, expiresAt } = await createInvitation({ kind: "founder" }, NOW);
    expect(
      await reasonOf(findRedeemableInvitation(prisma, token, new Date(expiresAt.getTime() - 1))),
    ).toBeNull();
    expect(await reasonOf(findRedeemableInvitation(prisma, token, expiresAt))).toBe("expired");
  });

  it("findRedeemableInvitation reports exhausted when usedCount >= maxUses", async () => {
    const { id, token } = await createInvitation({ kind: "founder" }, NOW);
    await prisma.invitation.update({ where: { id }, data: { usedCount: 1 } });
    expect(await reasonOf(findRedeemableInvitation(prisma, token, NOW))).toBe("exhausted");
  });

  it("previewInvitation returns kind and group name for member links and null group for founder links", async () => {
    const { group, admin } = await setup();
    const m = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id },
      NOW,
    );
    const f = await createInvitation({ kind: "founder" }, NOW);
    expect(await previewInvitation(m.token, NOW)).toEqual({
      ok: true,
      kind: "member",
      groupId: group.id,
      groupName: "Padelgruppe",
    });
    expect(await previewInvitation(f.token, NOW)).toEqual({
      ok: true,
      kind: "founder",
      groupId: null,
      groupName: null,
    });
    expect(await previewInvitation("nope", NOW)).toEqual({ ok: false, reason: "unknown" });
  });

  it("listOpenInvitations hides founder, revoked, expired and exhausted links and lists uses with player names", async () => {
    const { group, admin } = await setup();
    const other = await createTestGroup("Andere");
    const mk = (note: string, at = NOW) =>
      createInvitation({ kind: "member", groupId: group.id, createdById: admin.id, note }, at);
    const older = await mk("alt", new Date(NOW.getTime() - DAY));
    const open = await mk("offen");
    const revoked = await mk("widerrufen");
    const expired = await mk("abgelaufen", new Date(NOW.getTime() - 15 * DAY));
    const exhausted = await mk("voll");
    await createInvitation({ kind: "founder" }, NOW);
    await createInvitation(
      { kind: "member", groupId: other.id, createdById: admin.id, note: "fremd" },
      NOW,
    );
    await prisma.invitation.update({ where: { id: revoked.id }, data: { revokedAt: NOW } });
    await prisma.invitation.update({ where: { id: exhausted.id }, data: { usedCount: 25 } });

    const p1 = await createMember(group.id, { name: "Erste", email: "e1@example.com" });
    const p2 = await createMember(group.id, { name: "Zweite", email: "e2@example.com" });
    const t2 = new Date(NOW.getTime() + 2000);
    const t1 = new Date(NOW.getTime() + 1000);
    await prisma.invitationUse.create({ data: { invitationId: open.id, playerId: p2.id, usedAt: t2 } });
    await prisma.invitationUse.create({ data: { invitationId: open.id, playerId: p1.id, usedAt: t1 } });
    await prisma.invitation.update({ where: { id: open.id }, data: { usedCount: 2 } });

    const list = await listOpenInvitations(group.id, NOW);
    expect(list.map((l) => l.note)).toEqual(["offen", "alt"]);
    expect(list[0].id).toBe(open.id);
    expect(list[1].id).toBe(older.id);
    expect(expired.id).not.toBe(list[0].id);
    expect(list[0]).toMatchObject({ usedCount: 2, maxUses: 25 });
    expect(list[0].uses).toEqual([
      { playerId: p1.id, playerName: "Erste", usedAt: t1 },
      { playerId: p2.id, playerName: "Zweite", usedAt: t2 },
    ]);
    expect(list[1].uses).toEqual([]);
  });

  it("revokeInvitation sets revokedAt, writes audit, and rejects an id of another group", async () => {
    const { group, admin } = await setup();
    const other = await createTestGroup("Andere");
    const inv = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id, note: "x" },
      NOW,
    );
    await expect(
      revokeInvitation({ id: inv.id, groupId: other.id, actorId: admin.id, now: NOW }),
    ).rejects.toBeInstanceOf(InvitationNotFoundError);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt).toBeNull();

    await revokeInvitation({ id: inv.id, groupId: group.id, actorId: admin.id, now: NOW });
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).revokedAt).toEqual(NOW);
    const audit = await prisma.auditLog.findMany({ where: { action: "invitation.revoke" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      groupId: group.id,
      entityType: "Invitation",
      entityId: inv.id,
      payload: { note: "x" },
    });

    await expect(
      revokeInvitation({ id: inv.id, groupId: group.id, actorId: admin.id, now: NOW }),
    ).rejects.toBeInstanceOf(InvitationNotFoundError);
    expect(await prisma.auditLog.count({ where: { action: "invitation.revoke" } })).toBe(1);
  });

  it("listFounderInvitations and revokeFounderInvitation only touch founder links", async () => {
    const { group, admin } = await setup();
    const member = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id },
      NOW,
    );
    const f = await createInvitation({ kind: "founder", note: "Gründer" }, NOW);
    const list = await listFounderInvitations(NOW);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: f.id, note: "Gründer", usedCount: 0, expiresAt: f.expiresAt });

    await expect(revokeFounderInvitation(member.id, NOW)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    await expect(revokeFounderInvitation("unbekannt", NOW)).rejects.toBeInstanceOf(
      InvitationNotFoundError,
    );
    await revokeFounderInvitation(f.id, NOW);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: f.id } })).revokedAt).toEqual(NOW);
    expect(await listFounderInvitations(NOW)).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: "invitation.revoke" } })).toBe(0);
    await expect(revokeFounderInvitation(f.id, NOW)).rejects.toBeInstanceOf(InvitationNotFoundError);
  });
});
