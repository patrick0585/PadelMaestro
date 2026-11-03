import { describe, it, expect, beforeEach, vi } from "vitest";

// next-auth imports next/server which isn't available in the vitest jsdom
// environment. Stub out the NextAuth export so @/auth can be imported; the
// authorizeForTests function is a plain export that doesn't use NextAuth.
vi.mock("next-auth", () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(() => ({ id: "credentials" })),
}));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { resetDb } from "../helpers/reset-db";

import { authorizeForTests } from "@/auth";

async function seedPlayer(input: { email: string; username?: string; password: string }) {
  return prisma.player.create({
    data: {
      name: "P",
      email: input.email,
      username: input.username ?? null,
      passwordHash: await hashPassword(input.password),
    },
  });
}

describe("authorize (identifier-based)", () => {
  beforeEach(resetDb);

  it("logs in by email", async () => {
    const p = await seedPlayer({ email: "a@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "a@example.com", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("login with 'Patrick@Example.com ' finds the account stored lowercase", async () => {
    const p = await seedPlayer({ email: "patrick@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "Patrick@Example.com ", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("logs in by exact-case username", async () => {
    const p = await seedPlayer({ email: "b@example.com", username: "alice", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "alice", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("logs in by mixed-case username (normalised)", async () => {
    const p = await seedPlayer({ email: "c@example.com", username: "bob", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "BoB", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("returns null on unknown identifier", async () => {
    await seedPlayer({ email: "d@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "nobody@example.com", password: "pw12345678" });
    expect(user).toBeNull();
  });

  it("returns null on correct identifier + wrong password", async () => {
    await seedPlayer({ email: "e@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "e@example.com", password: "wrong-password" });
    expect(user).toBeNull();
  });

  it("does not log in a deleted player", async () => {
    const p = await seedPlayer({ email: "f@example.com", username: "ghost", password: "pw12345678" });
    await prisma.player.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    const byEmail = await authorizeForTests({ identifier: "f@example.com", password: "pw12345678" });
    const byUsername = await authorizeForTests({ identifier: "ghost", password: "pw12345678" });
    expect(byEmail).toBeNull();
    expect(byUsername).toBeNull();
  });
});

describe("authorize (group and role)", () => {
  beforeEach(resetDb);

  async function group(slug: string) {
    return prisma.group.create({ data: { name: slug, slug } });
  }

  it("returns groupId and role of the active membership", async () => {
    const p = await seedPlayer({ email: "g1@example.com", password: "pw12345678" });
    const g = await group("grp-a");
    await prisma.membership.create({ data: { groupId: g.id, playerId: p.id, role: "admin" } });
    const user = await authorizeForTests({ identifier: "g1@example.com", password: "pw12345678" });
    expect(user?.groupId).toBe(g.id);
    expect(user?.role).toBe("admin");
    expect(user?.isAdmin).toBe(true);
  });

  it("picks the most recently joined active membership", async () => {
    const p = await seedPlayer({ email: "g2@example.com", password: "pw12345678" });
    const older = await group("grp-old");
    const newer = await group("grp-new");
    const removed = await group("grp-removed");
    await prisma.membership.create({
      data: { groupId: older.id, playerId: p.id, role: "owner", joinedAt: new Date("2026-01-01") },
    });
    await prisma.membership.create({
      data: { groupId: newer.id, playerId: p.id, role: "member", joinedAt: new Date("2026-03-01") },
    });
    await prisma.membership.create({
      data: {
        groupId: removed.id,
        playerId: p.id,
        role: "owner",
        joinedAt: new Date("2026-06-01"),
        removedAt: new Date("2026-07-01"),
      },
    });
    const user = await authorizeForTests({ identifier: "g2@example.com", password: "pw12345678" });
    expect(user?.groupId).toBe(newer.id);
    expect(user?.role).toBe("member");
    expect(user?.isAdmin).toBe(false);
  });

  it("without membership returns groupId null and isAdmin false", async () => {
    await seedPlayer({ email: "g3@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "g3@example.com", password: "pw12345678" });
    expect(user?.groupId).toBeNull();
    expect(user?.role).toBeNull();
    expect(user?.isAdmin).toBe(false);
  });
});
