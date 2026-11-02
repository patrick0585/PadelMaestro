import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { findPlayerForRefresh } from "@/lib/auth/refresh-lookup";
import { createTestGroup } from "../helpers/group";
import { resetDb } from "../helpers/reset-db";

async function mkPlayer() {
  return prisma.player.create({ data: { name: "P", email: "p@x", username: "pp" } });
}

describe("findPlayerForRefresh", () => {
  beforeEach(resetDb);

  it("ignores a newer removed membership in another group", async () => {
    const p = await mkPlayer();
    const g1 = await createTestGroup("Eins");
    const g2 = await createTestGroup("Zwei");
    await prisma.membership.create({
      data: { groupId: g1.id, playerId: p.id, role: "admin", joinedAt: new Date("2026-01-01") },
    });
    await prisma.membership.create({
      data: {
        groupId: g2.id,
        playerId: p.id,
        role: "owner",
        joinedAt: new Date("2026-06-01"),
        removedAt: new Date("2026-07-01"),
      },
    });
    const res = await findPlayerForRefresh(prisma, p.id);
    expect(res?.membership).toEqual({ groupId: g1.id, role: "admin" });
  });

  it("returns membership null but keeps player fields when none is active", async () => {
    const p = await mkPlayer();
    const g = await createTestGroup();
    await prisma.membership.create({
      data: { groupId: g.id, playerId: p.id, role: "admin", removedAt: new Date() },
    });
    const res = await findPlayerForRefresh(prisma, p.id);
    expect(res).toEqual({ username: "pp", deletedAt: null, membership: null });
  });

  it("returns null for an unknown id", async () => {
    expect(await findPlayerForRefresh(prisma, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("picks deterministically by id when joinedAt is identical", async () => {
    const p = await mkPlayer();
    const g1 = await createTestGroup("Eins");
    const g2 = await createTestGroup("Zwei");
    const joinedAt = new Date("2026-03-03T00:00:00Z");
    const a = await prisma.membership.create({
      data: { groupId: g1.id, playerId: p.id, role: "member", joinedAt },
    });
    const b = await prisma.membership.create({
      data: { groupId: g2.id, playerId: p.id, role: "admin", joinedAt },
    });
    const winner = a.id > b.id ? a : b;
    const res = await findPlayerForRefresh(prisma, p.id);
    expect(res?.membership).toEqual({ groupId: winner.groupId, role: winner.role });
  });
});
