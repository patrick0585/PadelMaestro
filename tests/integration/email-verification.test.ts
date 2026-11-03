import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import {
  confirmEmailToken,
  requestEmailChange,
  sendVerification,
} from "@/lib/account/email-verification";
import { EmailTakenError, InvalidTokenError } from "@/lib/account/errors";

const LINK = /\/email-bestaetigen\/([A-Za-z0-9_-]{43})/;

function lastToken(): string {
  const msg = memoryOutbox.at(-1);
  const match = msg?.text.match(LINK);
  if (!match) throw new Error("no verification link in outbox");
  return match[1];
}

async function member(email: string, emailVerifiedAt: Date | null = null) {
  const group = await createTestGroup();
  return createMember(group.id, { name: "Maxi", email, emailVerifiedAt });
}

describe("email verification", () => {
  beforeEach(async () => {
    await resetDb();
    clearMemoryOutbox();
  });

  it("requestEmailChange stores pendingEmail, creates one token and sends a mail to the new address", async () => {
    const me = await member("alt@example.com", new Date());
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBe("neu@example.com");
    expect(stored.email).toBe("alt@example.com");

    const tokens = await prisma.emailToken.findMany({ where: { playerId: me.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].purpose).toBe("verify_email");
    expect(tokens[0].email).toBe("neu@example.com");
    expect(tokens[0].usedAt).toBeNull();
    const ttl = tokens[0].expiresAt.getTime() - tokens[0].createdAt.getTime();
    expect(Math.abs(ttl - 24 * 3600_000)).toBeLessThan(60_000);

    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("neu@example.com");
    expect(memoryOutbox[0].subject).toBe("Bitte bestätige deine E-Mail-Adresse");
    expect(memoryOutbox[0].text).toContain("Hallo Maxi,");
    // Only the hash is stored, never the raw token.
    expect(tokens[0].tokenHash).not.toBe(lastToken());
  });

  it("requestEmailChange lowercases and trims the address", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "  Neu@Example.COM " });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBe("neu@example.com");
    expect(memoryOutbox[0].to).toBe("neu@example.com");
  });

  it("requestEmailChange rejects an address of another account with EmailTakenError", async () => {
    const me = await member("alt@example.com");
    await member("belegt@example.com");

    await expect(
      requestEmailChange({ playerId: me.id, newEmail: "Belegt@example.com" }),
    ).rejects.toBeInstanceOf(EmailTakenError);

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBeNull();
    expect(await prisma.emailToken.count()).toBe(0);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("requestEmailChange with the current, already verified address is a no-op", async () => {
    const me = await member("alt@example.com", new Date());
    await requestEmailChange({ playerId: me.id, newEmail: "ALT@example.com" });

    expect(await prisma.emailToken.count()).toBe(0);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("requestEmailChange back to the verified address drops the pending change", async () => {
    const me = await member("alt@example.com", new Date());
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const pending = lastToken();
    clearMemoryOutbox();

    await requestEmailChange({ playerId: me.id, newEmail: "alt@example.com" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBeNull();
    expect(memoryOutbox).toHaveLength(0);
    await expect(confirmEmailToken(pending)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("requestEmailChange with the current, unverified address sends a verification to it", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "alt@example.com" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBeNull();
    expect(memoryOutbox.map((m) => m.to)).toEqual(["alt@example.com"]);
  });

  it("second request invalidates the first token (first link → InvalidTokenError)", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "erst@example.com" });
    const first = lastToken();
    await requestEmailChange({ playerId: me.id, newEmail: "zweit@example.com" });
    const second = lastToken();

    await expect(confirmEmailToken(first)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(confirmEmailToken(second)).resolves.toEqual({
      playerId: me.id,
      email: "zweit@example.com",
    });
  });

  it("confirmEmailToken moves pendingEmail to email, sets emailVerifiedAt, marks token used, writes audit player.email_change", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const now = new Date();

    const result = await confirmEmailToken(lastToken(), now);
    expect(result).toEqual({ playerId: me.id, email: "neu@example.com" });

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("neu@example.com");
    expect(stored.pendingEmail).toBeNull();
    expect(stored.emailVerifiedAt).toEqual(now);

    const token = await prisma.emailToken.findFirstOrThrow({ where: { playerId: me.id } });
    expect(token.usedAt).toEqual(now);

    const logs = await prisma.auditLog.findMany({ where: { entityId: me.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("player.email_change");
    expect(logs[0].actorId).toBe(me.id);
    expect(logs[0].entityType).toBe("Player");
    expect(logs[0].payload).toEqual({ from: "alt@example.com", to: "neu@example.com" });
  });

  it("confirmEmailToken on the current address writes audit player.email_verified", async () => {
    const me = await member("alt@example.com");
    await sendVerification({ playerId: me.id });
    await confirmEmailToken(lastToken());

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("alt@example.com");
    expect(stored.emailVerifiedAt).not.toBeNull();
    const logs = await prisma.auditLog.findMany({ where: { entityId: me.id } });
    expect(logs.map((l) => [l.action, l.payload])).toEqual([
      ["player.email_verified", { email: "alt@example.com" }],
    ]);
  });

  it("confirmEmailToken on a token whose address was taken meanwhile throws EmailTakenError and leaves email unchanged", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const token = lastToken();
    await member("neu@example.com");

    await expect(confirmEmailToken(token)).rejects.toBeInstanceOf(EmailTakenError);

    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("alt@example.com");
    expect(stored.emailVerifiedAt).toBeNull();
    const row = await prisma.emailToken.findFirstOrThrow({ where: { playerId: me.id } });
    expect(row.usedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: me.id } })).toBe(0);
  });

  it("confirmEmailToken rejects expired and reused tokens", async () => {
    const me = await member("alt@example.com");
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const token = lastToken();

    const afterExpiry = new Date(Date.now() + 25 * 3600_000);
    await expect(confirmEmailToken(token, afterExpiry)).rejects.toBeInstanceOf(
      InvalidTokenError,
    );

    await confirmEmailToken(token);
    await expect(confirmEmailToken(token)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(confirmEmailToken("unbekannt")).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("confirm after change notifies the old address only if it was verified", async () => {
    const verified = await member("bestaetigt@example.com", new Date());
    await requestEmailChange({ playerId: verified.id, newEmail: "neu1@example.com" });
    const t1 = lastToken();
    clearMemoryOutbox();
    await confirmEmailToken(t1);
    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("bestaetigt@example.com");
    expect(memoryOutbox[0].subject).toBe("Deine E-Mail-Adresse wurde geändert");
    expect(memoryOutbox[0].text).toContain("neu1@example.com");

    const unverified = await member("offen@example.com");
    await requestEmailChange({ playerId: unverified.id, newEmail: "neu2@example.com" });
    const t2 = lastToken();
    clearMemoryOutbox();
    await confirmEmailToken(t2);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("a failing notification to the old address does not undo the confirmation", async () => {
    const { setTransportForTests } = await import("@/lib/mail/send");
    const me = await member("alt@example.com", new Date());
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const token = lastToken();

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setTransportForTests({
      send: async () => {
        throw new Error("boom");
      },
    });
    try {
      await expect(confirmEmailToken(token)).resolves.toEqual({
        playerId: me.id,
        email: "neu@example.com",
      });
      expect(warn).toHaveBeenCalled();
    } finally {
      setTransportForTests(null);
      warn.mockRestore();
    }
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("neu@example.com");
  });

  it("sendVerification targets current email when no pendingEmail and is a no-op when already verified", async () => {
    const me = await member("alt@example.com");
    await sendVerification({ playerId: me.id });
    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("alt@example.com");
    const token = await prisma.emailToken.findFirstOrThrow({ where: { playerId: me.id } });
    expect(token.email).toBe("alt@example.com");

    clearMemoryOutbox();
    const done = await member("fertig@example.com", new Date());
    await sendVerification({ playerId: done.id });
    expect(memoryOutbox).toHaveLength(0);
    expect(await prisma.emailToken.count({ where: { playerId: done.id } })).toBe(0);
  });

  it("sendVerification is a no-op for a placeholder address", async () => {
    const me = await member("maxi@padel.local");
    await sendVerification({ playerId: me.id });
    expect(memoryOutbox).toHaveLength(0);
    expect(await prisma.emailToken.count({ where: { playerId: me.id } })).toBe(0);
  });

  it("sendVerification resends to pendingEmail and invalidates the previous token", async () => {
    const me = await member("alt@example.com", new Date());
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const first = lastToken();
    await sendVerification({ playerId: me.id });

    expect(memoryOutbox.at(-1)?.to).toBe("neu@example.com");
    await expect(confirmEmailToken(first)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(confirmEmailToken(lastToken())).resolves.toMatchObject({
      email: "neu@example.com",
    });
  });

  it("throws PlayerNotFoundError for a soft-deleted player", async () => {
    const { PlayerNotFoundError } = await import("@/lib/account/errors");
    const me = await member("alt@example.com");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(
      requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
    await expect(sendVerification({ playerId: me.id })).rejects.toBeInstanceOf(
      PlayerNotFoundError,
    );
  });
});
