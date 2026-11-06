// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { appleTestSetup, BUNDLE_ID, clearAppleEnv, setAppleEnv } from "../helpers/apple";
import { hashPassword } from "@/lib/auth/hash";
import { resolveAppleAccount, linkAppleToPlayer, setOwnName, needsName } from "@/lib/account/apple";
import { createInvitation } from "@/lib/invitations/create";
import { deleteOwnAccount } from "@/lib/account/delete";
import { buildAccountExport } from "@/lib/account/export";
import { changeOwnPassword, WrongCurrentPasswordError } from "@/lib/players/change-password";
import { authorizeApple } from "@/lib/auth/apple/authorize";
import { APPLE_NONCE_COOKIE, resetNoncesForTests } from "@/lib/auth/apple/nonce";
import { rateLimitResetForTests } from "@/lib/rate-limit";
import type { AppleIdentity } from "@/lib/auth/apple/verify";

const identity = (o: Partial<AppleIdentity> = {}): AppleIdentity => ({
  sub: "001.sub",
  email: "neu@example.com",
  emailVerified: true,
  clientId: BUNDLE_ID,
  ...o,
});

beforeEach(async () => {
  await resetDb();
  resetNoncesForTests();
  rateLimitResetForTests();
  delete process.env.PUBLIC_SIGNUP;
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearAppleEnv();
  delete process.env.PUBLIC_SIGNUP;
});

describe("resolveAppleAccount", () => {
  it("returns the account of a known Apple sub", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "a@example.com" });
    await prisma.player.update({ where: { id: p.id }, data: { appleSub: "001.sub" } });
    const r = await resolveAppleAccount({ identity: identity({ email: "other@example.com" }) });
    expect(r).toMatchObject({ playerId: p.id, created: false, needsRefreshToken: true });
  });

  it("links a verified account with the same e-mail", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: new Date() });
    const r = await resolveAppleAccount({ identity: identity() });
    expect(r.playerId).toBe(p.id);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).appleSub).toBe("001.sub");
    expect(await prisma.auditLog.count({ where: { action: "player.apple_link", actorId: p.id } })).toBe(1);
  });

  it("refuses to link an unverified account", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: null });
    await expect(resolveAppleAccount({ identity: identity() })).rejects.toMatchObject({
      code: "apple_email_unverified_account",
    });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).appleSub).toBeNull();
  });

  it("does not link an account whose e-mail belongs to a deleted player", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: new Date() });
    await prisma.player.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    process.env.PUBLIC_SIGNUP = "true";
    await expect(resolveAppleAccount({ identity: identity() })).rejects.toBeDefined();
  });

  it("creates a new account when public signup is on", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const r = await resolveAppleAccount({ identity: identity(), givenName: "Max", familyName: "Muster" });
    expect(r.created).toBe(true);
    const p = await prisma.player.findUniqueOrThrow({ where: { id: r.playerId } });
    expect(p).toMatchObject({ name: "Max Muster", passwordHash: null, needsName: false, appleSub: "001.sub" });
    expect(p.emailVerifiedAt).not.toBeNull();
    expect(p.termsAcceptedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorId: p.id, action: "player.signup" } });
    expect(audit.payload).toEqual({ kind: "apple" });
  });

  it("flags a nameless signup and clears the flag when the name is set", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const r = await resolveAppleAccount({ identity: identity() });
    expect(await needsName(r.playerId)).toBe(true);
    await setOwnName(r.playerId, "  Lena  ");
    expect(await needsName(r.playerId)).toBe(false);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: r.playerId } })).name).toBe("Lena");
  });

  it("uses a placeholder address when Apple sends no e-mail", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const r = await resolveAppleAccount({ identity: identity({ email: null }) });
    const p = await prisma.player.findUniqueOrThrow({ where: { id: r.playerId } });
    expect(p.email).toMatch(/^apple-[0-9a-f]{20}@anonym\.invalid$/);
  });

  it("refuses a new account without invitation when signup is closed", async () => {
    await expect(resolveAppleAccount({ identity: identity() })).rejects.toMatchObject({ code: "signup_closed" });
    expect(await prisma.player.count()).toBe(0);
  });

  it("joins the group of a valid invitation even when signup is closed", async () => {
    const g = await createTestGroup();
    const owner = await createMember(g.id, { name: "O", email: "o@example.com", role: "owner" });
    const inv = await createInvitation({ kind: "member", groupId: g.id, createdById: owner.id });
    const r = await resolveAppleAccount({ identity: identity(), givenName: "Neu", invitationToken: inv.token });
    expect(r.created).toBe(true);
    expect(await prisma.membership.count({ where: { groupId: g.id, playerId: r.playerId, removedAt: null } })).toBe(1);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).usedCount).toBe(1);
  });

  it("rejects an invalid invitation without creating an account", async () => {
    await expect(
      resolveAppleAccount({ identity: identity(), invitationToken: "x".repeat(40) }),
    ).rejects.toMatchObject({ code: "invitation_invalid" });
    expect(await prisma.player.count()).toBe(0);
  });
});

describe("linkAppleToPlayer", () => {
  it("links, is idempotent, and conflicts with another account", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    const b = await createMember(g.id, { name: "B", email: "b@example.com" });
    await linkAppleToPlayer({ playerId: a.id, identity: identity() });
    await linkAppleToPlayer({ playerId: a.id, identity: identity() });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).appleSub).toBe("001.sub");
    await expect(linkAppleToPlayer({ playerId: b.id, identity: identity() })).rejects.toMatchObject({
      code: "apple_already_linked",
    });
  });

  it("refuses a second Apple ID on the same account", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    await linkAppleToPlayer({ playerId: a.id, identity: identity() });
    await expect(linkAppleToPlayer({ playerId: a.id, identity: identity({ sub: "002" }) })).rejects.toMatchObject({
      code: "apple_already_linked",
    });
  });
});

describe("deleteOwnAccount with Apple", () => {
  async function appleUser() {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "a@example.com" });
    await prisma.player.update({
      where: { id: p.id },
      data: { appleSub: "001.sub", appleRefreshToken: "rt-1", appleClientId: BUNDLE_ID },
    });
    return p;
  }

  it("revokes at Apple with the stored client and clears the Apple columns", async () => {
    const t = await appleTestSetup();
    setAppleEnv(t.privateKeyPem);
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = await appleUser();
    await deleteOwnAccount({ playerId: p.id });
    const calls = fetchMock.mock.calls as unknown as [string, { body: URLSearchParams }][];
    expect(calls[0][0]).toBe("https://appleid.apple.com/auth/revoke");
    expect(calls[0][1].body.get("token")).toBe("rt-1");
    expect(calls[0][1].body.get("client_id")).toBe(BUNDLE_ID);
    expect(calls[0][1].body.get("token_type_hint")).toBe("refresh_token");
    const after = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ appleSub: null, appleRefreshToken: null, appleClientId: null });
    expect(after.deletedAt).not.toBeNull();
  });

  it("still deletes when Apple is unreachable", async () => {
    const t = await appleTestSetup();
    setAppleEnv(t.privateKeyPem);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const p = await appleUser();
    await expect(deleteOwnAccount({ playerId: p.id })).resolves.toBeUndefined();
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).not.toBeNull();
  });

  it("still deletes when Apple is not configured", async () => {
    const p = await appleUser();
    await deleteOwnAccount({ playerId: p.id });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).not.toBeNull();
  });

  it("still requires the password for password accounts", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "P", email: "p@example.com", passwordHash: await hashPassword("geheim123") });
    await expect(deleteOwnAccount({ playerId: p.id })).rejects.toMatchObject({ name: "WrongPasswordError" });
  });
});

describe("export", () => {
  it("never contains the Apple fields", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "a@example.com" });
    await prisma.player.update({
      where: { id: p.id },
      data: { appleSub: "001.secretsub", appleRefreshToken: "secret-rt", appleClientId: BUNDLE_ID },
    });
    const json = JSON.stringify(await buildAccountExport(p.id));
    expect(json).not.toContain("secretsub");
    expect(json).not.toContain("secret-rt");
    expect(json.toLowerCase()).not.toContain("apple");
  });
});

describe("setting a first password", () => {
  it("works without current password only for accounts that have none", async () => {
    const g = await createTestGroup();
    const apple = await createMember(g.id, { name: "A", email: "a@example.com" });
    await changeOwnPassword({ playerId: apple.id, newPassword: "neues-passwort-1" });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: apple.id } })).passwordHash).not.toBeNull();
    await expect(
      changeOwnPassword({ playerId: apple.id, newPassword: "noch-ein-passwort" }),
    ).rejects.toBeInstanceOf(WrongCurrentPasswordError);
  });
});

describe("authorizeApple (provider)", () => {
  it("logs in a new account, exchanges the code and stores the refresh token", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const t = await appleTestSetup();
    setAppleEnv(t.privateKeyPem);
    const fetchMock = vi.fn(async () => Response.json({ refresh_token: "rt-new" }));
    vi.stubGlobal("fetch", fetchMock);
    const token = await t.token({ sub: "001.web", email: "web@example.com", nonce: "nn" }, { aud: "de.padelmaestro.web" });
    const req = new Request("http://test/api/auth/callback/apple", {
      method: "POST",
      headers: { cookie: `${APPLE_NONCE_COOKIE}=nn` },
    });
    const user = await authorizeApple(
      { identityToken: token, authorizationCode: "code-1", givenName: "Web", familyName: "User" },
      req,
      { keys: t.keys },
    );
    expect(user).toMatchObject({ email: "web@example.com", name: "Web User", groupId: null });
    const p = await prisma.player.findUniqueOrThrow({ where: { id: user!.id } });
    expect(p).toMatchObject({ appleRefreshToken: "rt-new", appleClientId: "de.padelmaestro.web" });
    const body = (fetchMock.mock.calls as unknown as [string, { body: URLSearchParams }][])[0][1].body;
    expect(body.get("client_id")).toBe("de.padelmaestro.web");
    expect(body.get("grant_type")).toBe("authorization_code");

    await expect(authorizeApple({ identityToken: token }, req, { keys: t.keys })).rejects.toMatchObject({
      code: "apple_invalid_token",
    });
  });

  it("still logs in when the code exchange fails", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const t = await appleTestSetup();
    setAppleEnv(t.privateKeyPem);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
    const token = await t.token({ sub: "001.x", email: "x@example.com", nonce: "n2" });
    const req = new Request("http://test/x", { headers: { cookie: `${APPLE_NONCE_COOKIE}=n2` } });
    const user = await authorizeApple({ identityToken: token, authorizationCode: "c" }, req, { keys: t.keys });
    expect(user).not.toBeNull();
    expect((await prisma.player.findUniqueOrThrow({ where: { id: user!.id } })).appleRefreshToken).toBeNull();
  });

  it("is unavailable without configuration", async () => {
    await expect(authorizeApple({ identityToken: "x" }, undefined)).rejects.toMatchObject({
      code: "apple_unavailable",
    });
  });
});
