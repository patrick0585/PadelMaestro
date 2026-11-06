// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { appleTestSetup, BUNDLE_ID, clearAppleEnv, setAppleEnv } from "../helpers/apple";
import { needsName, resolveAppleAccount } from "@/lib/account/apple";
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

describe("resolveAppleAccount: Grenzfälle", () => {
  it("verknüpft nicht über eine von Apple unbestätigte Adresse", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: new Date() });
    await expect(resolveAppleAccount({ identity: identity({ emailVerified: false }) })).rejects.toMatchObject({
      code: "apple_email_unverified_account",
    });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).appleSub).toBeNull();
    expect(await prisma.player.count()).toBe(1);
  });

  it("verweigert die Verknüpfung, wenn das Konto schon eine andere Apple-ID hat", async () => {
    const g = await createTestGroup();
    const p = await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: new Date() });
    await prisma.player.update({ where: { id: p.id }, data: { appleSub: "001.other" } });
    await expect(resolveAppleAccount({ identity: identity() })).rejects.toMatchObject({
      code: "apple_already_linked",
    });
  });

  it("legt ohne Adresse und bei offener Registrierung ein Konto an, ohne zu verknüpfen", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const g = await createTestGroup();
    await createMember(g.id, { name: "A", email: "neu@example.com", emailVerifiedAt: new Date() });
    const r = await resolveAppleAccount({ identity: identity({ email: null }), givenName: "Neu" });
    expect(r.created).toBe(true);
    expect(await prisma.player.count()).toBe(2);
  });

  it("kürzt überlange Namen auf 60 Zeichen und trimmt", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const r = await resolveAppleAccount({
      identity: identity(),
      givenName: "  " + "A".repeat(50),
      familyName: "B".repeat(50),
    });
    const p = await prisma.player.findUniqueOrThrow({ where: { id: r.playerId } });
    expect(p.name.length).toBeLessThanOrEqual(60);
    expect(p.name).toBe(p.name.trim());
    expect(p.needsName).toBe(false);
  });

  it("behandelt Leerzeichen-Namen wie fehlenden Namen", async () => {
    process.env.PUBLIC_SIGNUP = "true";
    const r = await resolveAppleAccount({ identity: identity(), givenName: "  ", familyName: " " });
    expect(await needsName(r.playerId)).toBe(true);
  });

  it("needsName ist false für unbekannte Konten", async () => {
    expect(await needsName("gibt-es-nicht")).toBe(false);
  });
});

describe("authorizeApple: Fehlerpfade", () => {
  async function setup() {
    const t = await appleTestSetup();
    setAppleEnv(t.privateKeyPem);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    return t;
  }
  const reqWith = (nonce: string) =>
    new Request("http://test/x", { headers: { cookie: `${APPLE_NONCE_COOKIE}=${nonce}` } });

  it("meldet signup_closed für neue Konten ohne Einladung, ohne Konto anzulegen", async () => {
    const t = await setup();
    const token = await t.token({ sub: "001.new", email: "n@example.com", nonce: "n1" });
    await expect(authorizeApple({ identityToken: token }, reqWith("n1"), { keys: t.keys })).rejects.toMatchObject({
      code: "signup_closed",
    });
    expect(await prisma.player.count()).toBe(0);
  });

  it("liefert null bei ungültigem Eingabeformat", async () => {
    await setup();
    expect(await authorizeApple({}, undefined)).toBeNull();
    expect(await authorizeApple({ identityToken: "" }, undefined)).toBeNull();
    expect(await authorizeApple({ identityToken: "x".repeat(8001) }, undefined)).toBeNull();
  });

  it("lehnt ein Token ohne passende Nonce-Cookie ab", async () => {
    const t = await setup();
    const token = await t.token({ sub: "001.n", nonce: "n1" });
    await expect(
      authorizeApple({ identityToken: token }, new Request("http://test/x"), { keys: t.keys }),
    ).rejects.toMatchObject({ code: "apple_invalid_token" });
  });

  it("begrenzt Versuche pro Minute", async () => {
    const t = await setup();
    const req = new Request("http://test/x", { headers: { "x-forwarded-for": "9.9.9.9" } });
    for (let i = 0; i < 10; i++) {
      await expect(authorizeApple({ identityToken: "bad" }, req, { keys: t.keys })).rejects.toMatchObject({
        code: "apple_invalid_token",
      });
    }
    await expect(authorizeApple({ identityToken: "bad" }, req, { keys: t.keys })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });
});
