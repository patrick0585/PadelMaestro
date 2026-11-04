import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createTestGroup, createMember } from "../helpers/group";
import { renameGroup } from "@/lib/group/rename";
import { ForbiddenError } from "@/lib/auth/group-context";

beforeEach(resetDb);

describe("renameGroup", () => {
  it("renameGroup trims, keeps the slug, writes audit group.rename", async () => {
    const group = await createTestGroup("Alte Gruppe");
    const owner = await createMember(group.id, { name: "Olga", email: "o@example.com", role: "owner" });
    const admin = await createMember(group.id, { name: "Armin", email: "a@example.com", role: "admin" });
    const member = await createMember(group.id, { name: "Mia", email: "m@example.com" });

    const res = await renameGroup({ groupId: group.id, actorId: owner.id, name: "  Neue Gruppe  " });
    expect(res).toEqual({ name: "Neue Gruppe" });

    const after = await prisma.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(after.name).toBe("Neue Gruppe");
    expect(after.slug).toBe(group.slug);

    const audits = await prisma.auditLog.findMany({ where: { action: "group.rename" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      groupId: group.id,
      actorId: owner.id,
      entityType: "Group",
      entityId: group.id,
      payload: { from: "Alte Gruppe", to: "Neue Gruppe" },
    });

    // Unchanged name: no-op, no second audit row.
    await renameGroup({ groupId: group.id, actorId: owner.id, name: "Neue Gruppe" });
    expect(await prisma.auditLog.count({ where: { action: "group.rename" } })).toBe(1);

    await expect(
      renameGroup({ groupId: group.id, actorId: member.id, name: "Mitglied-Name" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).name).toBe("Neue Gruppe");

    expect(await renameGroup({ groupId: group.id, actorId: admin.id, name: "Admin-Name" })).toEqual({
      name: "Admin-Name",
    });
  });
});
