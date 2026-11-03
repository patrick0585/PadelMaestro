import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { confirmPasswordReset, requestPasswordReset } from "@/lib/account/password-reset";
import { InvalidTokenError } from "@/lib/account/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";
import { findPlayerForRefresh } from "@/lib/auth/refresh-lookup";
import { refreshTokenFromPlayer } from "@/lib/auth/refresh-token";

const LINK = /\/passwort-zuruecksetzen\/([A-Za-z0-9_-]{43})/;

function lastToken(): string {
  const match = memoryOutbox.at(-1)?.text.match(LINK);
  if (!match) throw new Error("no reset link in outbox");
  return match[1];
}

async function member(email: string, opts: { verified?: boolean; deleted?: boolean } = {}) {
  const group = await createTestGroup();
  const player = await createMember(group.id, {
    name: "Maxi",
    email,
    passwordHash: await hashPassword("altes-passwort"),
    emailVerifiedAt: opts.verified === false ? null : new Date(),
  });
  if (opts.deleted) {
    await prisma.player.update({ where: { id: player.id }, data: { deletedAt: new Date() } });
  }
  return player;
}

describe("password reset", () => {
  beforeEach(async () => {
    await resetDb();
    clearMemoryOutbox();
  });

  it("sends a reset mail with a link for a verified address", async () => {
    const me = await member("maxi@example.com");
    await requestPasswordReset("  Maxi@Example.com ");

    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("maxi@example.com");
    expect(memoryOutbox[0].subject).toBe("Passwort zurücksetzen");
    const tokens = await prisma.emailToken.findMany({ where: { playerId: me.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].purpose).toBe("password_reset");
    expect(tokens[0].tokenHash).not.toBe(lastToken());
    const ttl = tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime();
    expect(Math.abs(ttl - 3600_000)).toBeLessThan(60_000);
  });

  it("sends nothing for an unverified, unknown or deleted address and does not throw", async () => {
    await member("unverified@example.com", { verified: false });
    await member("deleted@example.com", { deleted: true });

    for (const email of ["unverified@example.com", "deleted@example.com", "nobody@example.com"]) {
      await expect(requestPasswordReset(email)).resolves.toBeUndefined();
    }
    expect(memoryOutbox).toHaveLength(0);
    expect(await prisma.emailToken.count()).toBe(0);
  });

  it("new request invalidates the previous token", async () => {
    await member("maxi@example.com");
    await requestPasswordReset("maxi@example.com");
    const first = lastToken();
    await requestPasswordReset("maxi@example.com");
    const second = lastToken();

    await expect(
      confirmPasswordReset({ token: first, newPassword: "neues-passwort-1" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(
      confirmPasswordReset({ token: second, newPassword: "neues-passwort-1" }),
    ).resolves.toBeUndefined();
  });

  it("confirmPasswordReset sets a new hash, marks the token used, writes audit", async () => {
    const me = await member("maxi@example.com");
    await requestPasswordReset("maxi@example.com");
    await confirmPasswordReset({ token: lastToken(), newPassword: "neues-passwort-1" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("neues-passwort-1", stored.passwordHash!)).toBe(true);
    expect(await verifyPassword("altes-passwort", stored.passwordHash!)).toBe(false);
    const tokens = await prisma.emailToken.findMany({ where: { playerId: me.id } });
    expect(tokens.every((t) => t.usedAt !== null)).toBe(true);
    const audit = await prisma.auditLog.findMany({ where: { action: "player.password_reset" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe(me.id);
    expect(audit[0].entityType).toBe("Player");
    expect(audit[0].entityId).toBe(me.id);
    expect(audit[0].payload).toEqual({ playerId: me.id, via: "email" });
  });

  it("confirmPasswordReset ends sessions that carry the old version", async () => {
    const me = await member("maxi@example.com");
    const oldToken = { id: me.id, sessionVersion: me.sessionVersion };
    await requestPasswordReset("maxi@example.com");
    await confirmPasswordReset({ token: lastToken(), newPassword: "neues-passwort-1" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.sessionVersion).toBe(me.sessionVersion + 1);
    const lookup = { findUnique: (id: string) => findPlayerForRefresh(prisma, id) };
    expect(await refreshTokenFromPlayer(oldToken, lookup)).toEqual({ kind: "invalidate" });
    const fresh = await refreshTokenFromPlayer({ ...oldToken, sessionVersion: stored.sessionVersion }, lookup);
    expect(fresh.kind).toBe("ok");
  });

  it("confirmPasswordReset rejects expired, used and unknown tokens", async () => {
    const me = await member("maxi@example.com");
    await requestPasswordReset("maxi@example.com");
    const token = lastToken();

    const later = new Date(Date.now() + 2 * 3600_000);
    await expect(
      confirmPasswordReset({ token, newPassword: "neues-passwort-1", now: later }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(
      confirmPasswordReset({ token: "x".repeat(43), newPassword: "neues-passwort-1" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);

    await confirmPasswordReset({ token, newPassword: "neues-passwort-1" });
    await expect(
      confirmPasswordReset({ token, newPassword: "anderes-passwort-2" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("neues-passwort-1", stored.passwordHash!)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "player.password_reset" } })).toBe(1);
  });
});
