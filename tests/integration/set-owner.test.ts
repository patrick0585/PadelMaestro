import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getSoleGroup } from "@/lib/group/sole-group";
import { DeletedPlayerError, PlayerNotFoundError, setGroupOwner } from "@/lib/group/set-owner";
import { resetDb } from "../helpers/reset-db";

async function mkPlayer(email: string, name: string) {
  return prisma.player.create({ data: { email, name } });
}

describe("setGroupOwner", () => {
  beforeEach(resetDb);

  it("makes the player owner, creating the membership if missing", async () => {
    const group = await getSoleGroup();
    const p = await mkPlayer("a@example.com", "A");

    const res = await setGroupOwner({ email: "a@example.com", groupId: group.id });

    expect(res).toEqual({ newOwnerId: p.id, previousOwnerId: null });
    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: p.id } },
    });
    expect(m.role).toBe("owner");
    expect(m.removedAt).toBeNull();
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).isAdmin).toBe(true);
  });

  it("demotes the previous owner to admin and reports them", async () => {
    const group = await getSoleGroup();
    const old = await mkPlayer("old@example.com", "Old");
    await prisma.player.update({ where: { id: old.id }, data: { isAdmin: true } });
    const next = await mkPlayer("new@example.com", "New");
    await prisma.membership.create({
      data: { groupId: group.id, playerId: old.id, role: "owner" },
    });

    const res = await setGroupOwner({ email: "new@example.com", groupId: group.id });

    expect(res).toEqual({ newOwnerId: next.id, previousOwnerId: old.id });
    const oldM = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: old.id } },
    });
    expect(oldM.role).toBe("admin");
    expect((await prisma.player.findUniqueOrThrow({ where: { id: next.id } })).isAdmin).toBe(true);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: old.id } })).isAdmin).toBe(true);
  });

  it("reactivates a removed membership when promoting", async () => {
    const group = await getSoleGroup();
    const p = await mkPlayer("a@example.com", "A");
    await prisma.membership.create({
      data: { groupId: group.id, playerId: p.id, role: "member", removedAt: new Date() },
    });

    await setGroupOwner({ email: "a@example.com", groupId: group.id });

    const m = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: p.id } },
    });
    expect(m.role).toBe("owner");
    expect(m.removedAt).toBeNull();
  });

  it("throws PlayerNotFoundError for an unknown email", async () => {
    const group = await getSoleGroup();
    await expect(
      setGroupOwner({ email: "nobody@example.com", groupId: group.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("rejects a soft-deleted account", async () => {
    const group = await getSoleGroup();
    await prisma.player.create({
      data: { email: "gone@example.com", name: "Gone", deletedAt: new Date() },
    });
    await expect(
      setGroupOwner({ email: "gone@example.com", groupId: group.id }),
    ).rejects.toBeInstanceOf(DeletedPlayerError);
    expect(await prisma.membership.count()).toBe(0);
  });

  it("is idempotent when the player is already owner", async () => {
    const group = await getSoleGroup();
    const p = await mkPlayer("a@example.com", "A");
    await prisma.membership.create({
      data: { groupId: group.id, playerId: p.id, role: "owner" },
    });

    const res = await setGroupOwner({ email: "a@example.com", groupId: group.id });

    expect(res).toEqual({ newOwnerId: p.id, previousOwnerId: null });
    expect(await prisma.membership.count({ where: { groupId: group.id, role: "owner" } })).toBe(1);
  });

  it("only touches the given group", async () => {
    const a = await prisma.group.create({ data: { name: "A", slug: "a" } });
    const b = await prisma.group.create({ data: { name: "B", slug: "b" } });
    const x = await mkPlayer("x@example.com", "X");
    const y = await mkPlayer("y@example.com", "Y");
    const pl = await mkPlayer("p@example.com", "P");
    await prisma.membership.createMany({
      data: [
        { groupId: a.id, playerId: x.id, role: "owner" },
        { groupId: b.id, playerId: y.id, role: "owner" },
      ],
    });

    const res = await setGroupOwner({ email: "p@example.com", groupId: b.id });

    expect(res).toEqual({ newOwnerId: pl.id, previousOwnerId: y.id });
    const role = async (groupId: string, playerId: string) =>
      (await prisma.membership.findUniqueOrThrow({
        where: { groupId_playerId: { groupId, playerId } },
      })).role;
    expect(await role(b.id, y.id)).toBe("admin");
    expect(await role(a.id, x.id)).toBe("owner");
  });
});
