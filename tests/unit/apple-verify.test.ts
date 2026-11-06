// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { verifyAppleIdentityToken } from "@/lib/auth/apple/verify";
import { claimNonce, nonceMatches, readCookie, resetNoncesForTests } from "@/lib/auth/apple/nonce";
import { appleClientSecret } from "@/lib/auth/apple/api";
import { appleConfig, appleConfigured } from "@/lib/auth/apple/config";
import { appleTestSetup, BUNDLE_ID, SERVICES_ID } from "../helpers/apple";

let t: Awaited<ReturnType<typeof appleTestSetup>>;
beforeAll(async () => {
  t = await appleTestSetup();
});
beforeEach(() => resetNoncesForTests());

const AUD = [BUNDLE_ID, SERVICES_ID];
const verify = (token: string, cookieNonce: string | null = "n1") =>
  verifyAppleIdentityToken(token, { audiences: AUD, cookieNonce: cookieNonce ?? undefined, keys: t.keys });

describe("verifyAppleIdentityToken", () => {
  it("accepts a valid native token and reports the identity", async () => {
    const id = await verify(await t.token({ sub: "001.abc", email: "A@Example.com", nonce: "n1" }));
    expect(id).toEqual({ sub: "001.abc", email: "a@example.com", emailVerified: true, clientId: BUNDLE_ID });
  });

  it("accepts the services ID audience and reports it as client", async () => {
    const id = await verify(await t.token({ sub: "s", nonce: "n1" }, { aud: SERVICES_ID }));
    expect(id.clientId).toBe(SERVICES_ID);
  });

  it.each([
    ["wrong audience", { aud: "com.other.app" }],
    ["wrong issuer", { iss: "https://evil.example" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])("rejects %s", async (_n, o) => {
    await expect(verify(await t.token({ sub: "s", nonce: "n1" }, o))).rejects.toMatchObject({
      code: "apple_invalid_token",
    });
  });

  it("rejects a bad signature", async () => {
    const other = await t.rsaOther();
    const bad = await t.token({ sub: "s", nonce: "n1" }, { key: other.privateKey });
    await expect(verify(bad)).rejects.toMatchObject({ code: "apple_invalid_token" });
  });

  it("rejects garbage and tokens without sub", async () => {
    await expect(verify("nope")).rejects.toMatchObject({ code: "apple_invalid_token" });
    await expect(verify(await t.token({ nonce: "n1" }))).rejects.toMatchObject({ code: "apple_invalid_token" });
  });

  it("accepts the SHA-256 hex nonce form", async () => {
    const hashed = createHash("sha256").update("n1").digest("hex");
    await expect(verify(await t.token({ sub: "s", nonce: hashed }))).resolves.toMatchObject({ sub: "s" });
  });

  it("rejects missing claim, missing cookie and mismatch", async () => {
    await expect(verify(await t.token({ sub: "s" }))).rejects.toMatchObject({ code: "apple_invalid_token" });
    await expect(verify(await t.token({ sub: "s", nonce: "n1" }), null)).rejects.toMatchObject({
      code: "apple_invalid_token",
    });
    await expect(verify(await t.token({ sub: "s", nonce: "other" }))).rejects.toMatchObject({
      code: "apple_invalid_token",
    });
  });

  it("spends the nonce: a second use fails", async () => {
    const token = await t.token({ sub: "s", nonce: "n1" });
    await verify(token);
    await expect(verify(token)).rejects.toMatchObject({ code: "apple_invalid_token" });
  });

  it("treats email_verified as boolean or string", async () => {
    const a = await verify(await t.token({ sub: "s", nonce: "n1", email_verified: false }));
    expect(a.emailVerified).toBe(false);
  });
});

describe("nonce helpers", () => {
  it("matches raw and hashed form only", () => {
    expect(nonceMatches("abc", "abc")).toBe(true);
    expect(nonceMatches("abc", createHash("sha256").update("abc").digest("hex"))).toBe(true);
    expect(nonceMatches("abc", "abd")).toBe(false);
    expect(nonceMatches("abc", undefined)).toBe(false);
    expect(nonceMatches(undefined, "abc")).toBe(false);
  });

  it("claims once and forgets after the lifetime", () => {
    expect(claimNonce("x", 1000)).toBe(true);
    expect(claimNonce("x", 2000)).toBe(false);
    expect(claimNonce("x", 1000 + 601_000)).toBe(true);
  });

  it("reads a cookie by name", () => {
    expect(readCookie("a=1; pm_apple_nonce=xyz; b=2", "pm_apple_nonce")).toBe("xyz");
    expect(readCookie(null, "a")).toBeUndefined();
  });
});

describe("config and client secret", () => {
  const env = (extra: Record<string, string> = {}) => ({
    APPLE_TEAM_ID: "T",
    APPLE_KEY_ID: "K",
    APPLE_BUNDLE_ID: BUNDLE_ID,
    APPLE_SERVICES_ID: SERVICES_ID,
    APPLE_PRIVATE_KEY: "pem\\nline",
    ...extra,
  });

  it("is configured only when everything is set", () => {
    expect(appleConfigured(env())).toBe(true);
    expect(appleConfig(env())?.privateKey).toBe("pem\nline");
    expect(appleConfigured(env({ APPLE_KEY_ID: "" }))).toBe(false);
    expect(appleConfigured(env({ APPLE_PRIVATE_KEY: "", APPLE_PRIVATE_KEY_PATH: "/does/not/exist" }))).toBe(false);
    expect(appleConfigured({})).toBe(false);
  });

  it("signs an ES256 client secret with team, key and client ID", async () => {
    const cfg = { teamId: "TEAM", keyId: "KID", bundleId: BUNDLE_ID, servicesId: SERVICES_ID, privateKey: t.privateKeyPem };
    const secret = await appleClientSecret(cfg, SERVICES_ID);
    const { payload, protectedHeader } = await jwtVerify(secret, t.ecPublicKey, { audience: "https://appleid.apple.com" });
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "KID" });
    expect(payload).toMatchObject({ iss: "TEAM", sub: SERVICES_ID });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300);
  });
});
