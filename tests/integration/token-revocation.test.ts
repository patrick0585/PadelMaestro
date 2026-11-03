import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { confirmEmailToken, requestEmailChange } from "@/lib/account/email-verification";
import { confirmPasswordReset, requestPasswordReset } from "@/lib/account/password-reset";
import { InvalidTokenError } from "@/lib/account/errors";
import { updatePlayer } from "@/lib/players/update";

const VERIFY = /\/email-bestaetigen\/([A-Za-z0-9_-]{43})/;
const RESET = /\/passwort-zuruecksetzen\/([A-Za-z0-9_-]{43})/;

function tokenFromOutbox(re: RegExp): string {
  const match = [...memoryOutbox].reverse().find((m) => re.test(m.text))?.text.match(re);
  if (!match) throw new Error("no link in outbox");
  return match[1];
}

async function setup() {
  const group = await createTestGroup();
  const admin = await createMember(group.id, { name: "Admin", email: "admin@example.com", role: "admin" });
  const me = await createMember(group.id, {
    name: "Maxi",
    email: "alt@example.com",
    emailVerifiedAt: new Date(),
  });
  return { group, admin, me };
}

describe("tokens after an address change", () => {
  beforeEach(async () => {
    await resetDb();
    clearMemoryOutbox();
  });

  it("admin address change rejects previously issued verify and reset tokens", async () => {
    const { group, admin, me } = await setup();
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const verify = tokenFromOutbox(VERIFY);
    await requestPasswordReset("alt@example.com");
    const reset = tokenFromOutbox(RESET);

    await updatePlayer({
      groupId: group.id,
      playerId: me.id,
      actorId: admin.id,
      fields: { email: "admin-gesetzt@example.com" },
    });

    await expect(confirmEmailToken(verify)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(
      confirmPasswordReset({ token: reset, newPassword: "neues-passwort-1" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    const open = await prisma.emailToken.count({ where: { playerId: me.id, usedAt: null } });
    expect(open).toBe(0);
  });

  it("confirmed change rejects an old reset token, revokes all tokens and keeps sessionVersion", async () => {
    const { me } = await setup();
    await requestPasswordReset("alt@example.com");
    const reset = tokenFromOutbox(RESET);
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    await confirmEmailToken(tokenFromOutbox(VERIFY));

    await expect(
      confirmPasswordReset({ token: reset, newPassword: "neues-passwort-1" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("neu@example.com");
    expect(stored.sessionVersion).toBe(me.sessionVersion);
    expect(await prisma.emailToken.count({ where: { playerId: me.id, usedAt: null } })).toBe(0);
  });

  it("confirming the current address does not bump sessionVersion", async () => {
    const group = await createTestGroup();
    const me = await createMember(group.id, { name: "Maxi", email: "alt@example.com" });
    await requestEmailChange({ playerId: me.id, newEmail: "alt@example.com" });
    await confirmEmailToken(tokenFromOutbox(VERIFY));
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.emailVerifiedAt).not.toBeNull();
    expect(stored.sessionVersion).toBe(me.sessionVersion);
  });

  it("rejects a verify token whose address no longer matches pendingEmail and marks it used", async () => {
    const { me } = await setup();
    await requestEmailChange({ playerId: me.id, newEmail: "neu@example.com" });
    const verify = tokenFromOutbox(VERIFY);
    // Pending address moved on without going through requestEmailChange.
    await prisma.player.update({ where: { id: me.id }, data: { pendingEmail: "anders@example.com" } });

    await expect(confirmEmailToken(verify)).rejects.toBeInstanceOf(InvalidTokenError);
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.email).toBe("alt@example.com");
    const token = await prisma.emailToken.findFirstOrThrow({ where: { email: "neu@example.com" } });
    expect(token.usedAt).not.toBeNull();
  });

  it("rejects a reset token whose address no longer matches the account", async () => {
    const { me } = await setup();
    await requestPasswordReset("alt@example.com");
    const reset = tokenFromOutbox(RESET);
    await prisma.player.update({ where: { id: me.id }, data: { email: "direkt@example.com" } });

    await expect(
      confirmPasswordReset({ token: reset, newPassword: "neues-passwort-1" }),
    ).rejects.toBeInstanceOf(InvalidTokenError);
    const token = await prisma.emailToken.findFirstOrThrow({ where: { playerId: me.id } });
    expect(token.usedAt).not.toBeNull();
  });
});
