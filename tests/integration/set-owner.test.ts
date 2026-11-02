import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getSoleGroup } from "@/lib/group/sole-group";
import { PlayerNotFoundError, setGroupOwner } from "@/lib/group/set-owner";
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
  });

  it("demotes the previous owner to admin and reports them", async () => {
    const group = await getSoleGroup();
    const old = await mkPlayer("old@example.com", "Old");
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
});
