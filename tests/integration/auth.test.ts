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
