import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createInvitation } from "@/lib/invitations/create";
import { joinWithInvitation } from "@/lib/invitations/redeem";
import { canFoundGroup, createGroup, NotFounderError } from "@/lib/group/create";

async function founder(email = "f@example.com") {
  const player = await prisma.player.create({
    data: { name: "Gründer", email, passwordHash: "x" },
  });
  const link = await createInvitation({ kind: "founder" });
  await joinWithInvitation({ token: link.token, playerId: player.id });
  return player;
}

async function plain(email = "p@example.com") {
  return prisma.player.create({ data: { name: "Plain", email, passwordHash: "x" } });
}

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

describe("createGroup", () => {
  it("with an open founder use creates group, owner, season, foundedGroupId and audit", async () => {
    const p = await founder();
    const g = await createGroup({ name: "  Padel Wien  ", founderId: p.id });
    expect(g.name).toBe("Padel Wien");
    expect(g.slug).toBe("padel-wien");

    expect(await prisma.group.findUnique({ where: { id: g.id } })).toMatchObject({ slug: "padel-wien" });
    const m = await prisma.membership.findFirst({ where: { groupId: g.id, playerId: p.id } });
    expect(m?.role).toBe("owner");
    expect(await prisma.season.count({ where: { groupId: g.id, isActive: true } })).toBe(1);
    const use = await prisma.invitationUse.findFirst({ where: { playerId: p.id } });
    expect(use?.foundedGroupId).toBe(g.id);
    const audit = await prisma.auditLog.findFirst({ where: { action: "group.create" } });
    expect(audit).toMatchObject({
      groupId: g.id,
      actorId: p.id,
      entityType: "Group",
      entityId: g.id,
      payload: { name: "Padel Wien", slug: "padel-wien" },
    });
  });

  it("without founder use throws NotFounderError when PUBLIC_SIGNUP is off and succeeds when on", async () => {
    const p = await plain();
    await expect(createGroup({ name: "Wien", founderId: p.id })).rejects.toBeInstanceOf(NotFounderError);
    expect(await prisma.group.count()).toBe(0);

    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const g = await createGroup({ name: "Wien", founderId: p.id });
    expect(await prisma.membership.count({ where: { groupId: g.id, playerId: p.id, role: "owner" } })).toBe(1);
  });

  it("twice with the same name yields slugs 'wien' and 'wien-2'", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const p = await plain();
    const a = await createGroup({ name: "Wien", founderId: p.id });
    const b = await createGroup({ name: "Wien", founderId: p.id });
    expect([a.slug, b.slug]).toEqual(["wien", "wien-2"]);
  });

  it("a founder use that already founded a group does not allow a second group", async () => {
    const p = await founder();
    await createGroup({ name: "Eins", founderId: p.id });
    await expect(createGroup({ name: "Zwei", founderId: p.id })).rejects.toBeInstanceOf(NotFounderError);
    expect(await prisma.group.count()).toBe(1);
  });

  it("concurrent calls spend one founder use only once", async () => {
    const p = await founder();
    const results = await Promise.allSettled([
      createGroup({ name: "Alpha", founderId: p.id }),
      createGroup({ name: "Beta", founderId: p.id }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect((bad[0] as PromiseRejectedResult).reason).toBeInstanceOf(NotFounderError);
    const groups = await prisma.group.findMany();
    expect(groups).toHaveLength(1);
    const use = await prisma.invitationUse.findFirst({ where: { playerId: p.id } });
    expect(use?.foundedGroupId).toBe(groups[0].id);
  });

  it("keeps a recorded use valid after the invitation was revoked", async () => {
    const p = await founder();
    await prisma.invitation.updateMany({ data: { revokedAt: new Date() } });
    const g = await createGroup({ name: "Spät", founderId: p.id });
    expect(g.slug).toBe("spaet");
  });
});

describe("canFoundGroup", () => {
  it("reflects open use or flag", async () => {
    const f = await founder();
    const p = await plain();
    expect(await canFoundGroup(f.id)).toBe(true);
    expect(await canFoundGroup(p.id)).toBe(false);
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    expect(await canFoundGroup(p.id)).toBe(true);
    vi.unstubAllEnvs();
    await createGroup({ name: "X", founderId: f.id });
    expect(await canFoundGroup(f.id)).toBe(false);
  });
});
