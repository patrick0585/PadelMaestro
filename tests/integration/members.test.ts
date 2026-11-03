import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findGroupMembership } from "@/lib/group/active-membership";
import { activeMemberPlayers, listActiveMembers } from "@/lib/group/members";
import { createMember, createTestGroup } from "../helpers/group";
import { resetDb } from "../helpers/reset-db";

async function removeMember(groupId: string, playerId: string) {
  await prisma.membership.updateMany({
    where: { groupId, playerId },
    data: { removedAt: new Date() },
  });
}

describe("members", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("findGroupMembership liefert Rolle des aktiven Mitglieds", async () => {
    const group = await createTestGroup();
    const p = await createMember(group.id, { name: "A", email: "a@x.de", role: "admin" });
    expect(await findGroupMembership(prisma, group.id, p.id)).toEqual({ role: "admin" });
  });

  it("findGroupMembership liefert null für entferntes Mitglied", async () => {
    const group = await createTestGroup();
    const p = await createMember(group.id, { name: "A", email: "a@x.de" });
    await removeMember(group.id, p.id);
    expect(await findGroupMembership(prisma, group.id, p.id)).toBeNull();
  });

  it("findGroupMembership liefert null für Mitglied einer anderen Gruppe", async () => {
    const g1 = await createTestGroup("Eins");
    const g2 = await createTestGroup("Zwei");
    const p = await createMember(g1.id, { name: "A", email: "a@x.de" });
    expect(await findGroupMembership(prisma, g2.id, p.id)).toBeNull();
  });

  it("listActiveMembers enthält nur aktive Mitglieder der Gruppe, sortiert nach Name, mit hasPassword, emailVerified und role", async () => {
    const g1 = await createTestGroup("Eins");
    const g2 = await createTestGroup("Zwei");
    const zed = await createMember(g1.id, {
      name: "Zed",
      email: "z@x.de",
      passwordHash: "h",
      username: "zed",
      emailVerifiedAt: new Date(),
    });
    const amy = await createMember(g1.id, { name: "Amy", email: "amy@x.de", role: "admin" });
    const gone = await createMember(g1.id, { name: "Bob", email: "b@x.de" });
    await createMember(g2.id, { name: "Other", email: "o@x.de" });
    await removeMember(g1.id, gone.id);

    expect(await listActiveMembers(g1.id)).toEqual([
      {
        id: amy.id,
        name: "Amy",
        email: "amy@x.de",
        username: null,
        role: "admin",
        hasPassword: false,
        emailVerified: false,
        avatarVersion: amy.avatarVersion,
      },
      {
        id: zed.id,
        name: "Zed",
        email: "z@x.de",
        username: "zed",
        role: "member",
        hasPassword: true,
        emailVerified: true,
        avatarVersion: zed.avatarVersion,
      },
    ]);
  });

  it("activeMemberPlayers liefert nur aktive Mitglieder der Gruppe", async () => {
    const g1 = await createTestGroup("Eins");
    const g2 = await createTestGroup("Zwei");
    const amy = await createMember(g1.id, { name: "Amy", email: "amy@x.de" });
    const gone = await createMember(g1.id, { name: "Bob", email: "b@x.de" });
    const other = await createMember(g2.id, { name: "Other", email: "o@x.de" });
    const notRequested = await createMember(g1.id, { name: "Zed", email: "z@x.de" });
    await removeMember(g1.id, gone.id);

    const rows = await activeMemberPlayers(g1.id, [amy.id, gone.id, other.id]);
    expect(rows).toEqual([{ id: amy.id, name: "Amy", avatarVersion: amy.avatarVersion }]);
    expect(rows.map((r) => r.id)).not.toContain(notRequested.id);
    expect(await activeMemberPlayers(g1.id, [])).toEqual([]);
  });
});
