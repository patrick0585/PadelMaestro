// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAppleIdentityToken } from "@/lib/auth/apple/verify";
import { resetNoncesForTests } from "@/lib/auth/apple/nonce";
import { appleTestSetup, BUNDLE_ID, SERVICES_ID } from "../helpers/apple";

let t: Awaited<ReturnType<typeof appleTestSetup>>;
beforeAll(async () => {
  t = await appleTestSetup();
});
beforeEach(() => resetNoncesForTests());

const verify = (token: string) =>
  verifyAppleIdentityToken(token, { audiences: [BUNDLE_ID, SERVICES_ID], cookieNonce: "n1", keys: t.keys });

describe("verifyAppleIdentityToken: Claims", () => {
  it.each([
    ["true", true],
    ["false", false],
    [true, true],
    [false, false],
    ["TRUE", false],
    [1, false],
    [undefined, false],
  ])("wertet email_verified=%j als %s", async (raw, expected) => {
    const claims: Record<string, unknown> = { sub: "s", nonce: "n1", email: "a@example.com" };
    claims.email_verified = raw;
    const id = await verify(await t.token(claims));
    expect(id.emailVerified).toBe(expected);
  });

  it("liefert email null, wenn Apple keine Adresse sendet", async () => {
    const id = await verify(await t.token({ sub: "s", nonce: "n1" }));
    expect(id.email).toBeNull();
  });

  it("liefert email null bei leerer oder nur aus Leerzeichen bestehender Adresse", async () => {
    const id = await verify(await t.token({ sub: "s", nonce: "n1", email: "   " }));
    expect(id.email).toBeNull();
  });

  it("verbraucht die Nonce nicht, wenn die Signatur ungültig ist", async () => {
    const other = await t.rsaOther();
    const bad = await t.token({ sub: "s", nonce: "n1" }, { key: other.privateKey });
    await expect(verify(bad)).rejects.toMatchObject({ code: "apple_invalid_token" });
    await expect(verify(await t.token({ sub: "s", nonce: "n1" }))).resolves.toMatchObject({ sub: "s" });
  });
});
