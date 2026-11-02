import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { bootstrapAdmin, PlayerExistsError } from "@/lib/group/bootstrap-admin";
import { getSoleGroup } from "@/lib/group/sole-group";
import { createMember } from "../helpers/group";
import { resetDb } from "../helpers/reset-db";

describe("bootstrapAdmin", () => {
  beforeEach(resetDb);

  it("legt auf leerer DB Gruppe an und macht den Admin zum Besitzer", async () => {
    const res = await bootstrapAdmin({ email: "a@x", name: "A", password: "pw-123456" });
    expect(await prisma.group.count()).toBe(1);
    expect(res.role).toBe("owner");
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: res.playerId } });
    expect(m.role).toBe("owner");
    expect(m.groupId).toBe(res.groupId);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: res.playerId } });
    expect(p.isAdmin).toBe(true);
    expect(p.passwordHash).toBeTruthy();
  });

  it("vergibt admin, wenn die Gruppe schon einen Besitzer hat", async () => {
    const group = await getSoleGroup();
    await createMember(group.id, { name: "Chef", email: "o@x", role: "owner" });
    const res = await bootstrapAdmin({ email: "b@x", name: "B", password: "pw-123456" });
    expect(res.role).toBe("admin");
    const m = await prisma.membership.findFirstOrThrow({ where: { playerId: res.playerId } });
    expect(m.role).toBe("admin");
  });

  it("wirft PlayerExistsError bei vorhandener E-Mail", async () => {
    const group = await getSoleGroup();
    await createMember(group.id, { name: "X", email: "dup@x" });
    await expect(
      bootstrapAdmin({ email: "dup@x", name: "Y", password: "pw-123456" }),
    ).rejects.toBeInstanceOf(PlayerExistsError);
  });

  it("becomes owner when the only existing owner membership is removed", async () => {
    const group = await getSoleGroup();
    const old = await createMember(group.id, { name: "Chef", email: "o@x", role: "owner" });
    const removedAt = new Date();
    await prisma.membership.update({
      where: { groupId_playerId: { groupId: group.id, playerId: old.id } },
      data: { removedAt },
    });
    const res = await bootstrapAdmin({ email: "n@x", name: "N", password: "pw-123456" });
    expect(res.role).toBe("owner");
    const oldRow = await prisma.membership.findUniqueOrThrow({
      where: { groupId_playerId: { groupId: group.id, playerId: old.id } },
    });
    expect(oldRow.role).toBe("owner");
    expect(oldRow.removedAt?.getTime()).toBe(removedAt.getTime());
  });
});
