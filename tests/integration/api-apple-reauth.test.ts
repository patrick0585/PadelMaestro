// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, sessionFor } from "../helpers/group";
import { appleTestSetup, clearAppleEnv, nonceCookie, setAppleEnv } from "../helpers/apple";
import { APPLE_NONCE_COOKIE, resetNoncesForTests } from "@/lib/auth/apple/nonce";
import { rateLimitResetForTests } from "@/lib/rate-limit";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/apple/flow", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/apple/flow")>();
  return {
    ...real,
    verifyRequestIdentity: (
      cfg: Parameters<typeof real.verifyRequestIdentity>[0],
      req: Parameters<typeof real.verifyRequestIdentity>[1],
      token: string,
    ) => real.verifyRequestIdentity(cfg, req, token, keysRef.current),
  };
});
import { auth } from "@/auth";
import { DELETE as deleteAccount } from "@/app/api/profile/route";
import { POST as setPassword } from "@/app/api/profile/password/route";
import { DELETE as deleteGroup } from "@/app/api/groups/active/route";
import { POST as link } from "@/app/api/account/apple/link/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const keysRef: { current: Awaited<ReturnType<typeof appleTestSetup>>["keys"] | undefined } = { current: undefined };
let t: Awaited<ReturnType<typeof appleTestSetup>>;

const call = (
  handler: (r: Request) => Promise<Response>,
  method: string,
  body: unknown,
  cookie?: string,
) =>
  handler(
    new Request("http://test/api/x", {
      method,
      headers: { "content-type": "application/json", ...(cookie && { cookie }) },
      body: JSON.stringify(body),
    }),
  );

async function appleOnly(role: "owner" | "member" = "member") {
  const g = await createTestGroup("Runde");
  const p = await createMember(g.id, { name: "A", email: "a@example.com", role });
  await prisma.player.update({ where: { id: p.id }, data: { appleSub: "001.me" } });
  authMock.mockResolvedValue(sessionFor(p, g.id, role));
  return { g, p };
}

beforeEach(async () => {
  await resetDb();
  resetNoncesForTests();
  rateLimitResetForTests();
  authMock.mockReset();
  t = await appleTestSetup();
  keysRef.current = t.keys;
  setAppleEnv(t.privateKeyPem);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearAppleEnv();
});

describe("DELETE /api/profile (Apple-only)", () => {
  it("403 apple_reauth_required without token, with foreign sub, stale token or forged cookie", async () => {
    const { p } = await appleOnly();
    const cases: [unknown, string | undefined][] = [
      [{}, undefined],
      [{ identityToken: await t.token({ sub: "001.other", nonce: "n1" }) }, nonceCookie("n1")],
      [{ identityToken: await t.token({ sub: "001.me", nonce: "n2" }, { iat: Math.floor(Date.now() / 1000) - 3600 }) }, nonceCookie("n2")],
      [{ identityToken: await t.token({ sub: "001.me", nonce: "forged" }) }, `${APPLE_NONCE_COOKIE}=forged`],
    ];
    for (const [body, cookie] of cases) {
      const res = await call(deleteAccount, "DELETE", body, cookie);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("apple_reauth_required");
    }
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).toBeNull();
  });

  it("204 with a fresh token for the own Apple ID", async () => {
    const { p } = await appleOnly();
    const res = await call(deleteAccount, "DELETE", { identityToken: await t.token({ sub: "001.me", nonce: "n1" }) }, nonceCookie("n1"));
    expect(res.status).toBe(204);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: p.id } })).deletedAt).not.toBeNull();
  });
});

describe("POST /api/profile/password (Apple-only)", () => {
  it("403 without proof, 204 with a fresh proof and bumps the session version", async () => {
    const { p } = await appleOnly();
    const body = { newPassword: "neues-passwort-1" };
    const denied = await call(setPassword, "POST", body);
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("apple_reauth_required");
    const ok = await call(
      setPassword,
      "POST",
      { ...body, identityToken: await t.token({ sub: "001.me", nonce: "n1" }) },
      nonceCookie("n1"),
    );
    expect(ok.status).toBe(204);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.passwordHash).not.toBeNull();
    expect(after.sessionVersion).toBe(1);
  });
});

describe("DELETE /api/groups/active (Apple-only owner)", () => {
  it("403 without proof, 204 with a fresh proof", async () => {
    const { g } = await appleOnly("owner");
    const body = { groupId: g.id, name: "Runde" };
    const denied = await call(deleteGroup, "DELETE", body);
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("apple_reauth_required");
    expect(await prisma.group.count({ where: { id: g.id } })).toBe(1);
    const ok = await call(
      deleteGroup,
      "DELETE",
      { ...body, identityToken: await t.token({ sub: "001.me", nonce: "n1" }) },
      nonceCookie("n1"),
    );
    expect(ok.status).toBe(204);
    expect(await prisma.group.count({ where: { id: g.id } })).toBe(0);
  });
});

describe("server-bound nonce", () => {
  it("rejects an unsigned cookie that equals the token claim", async () => {
    const { p } = await appleOnly();
    await prisma.player.update({ where: { id: p.id }, data: { appleSub: null } });
    const token = await t.token({ sub: "001.new", nonce: "attacker" });
    const res = await call(link, "POST", { identityToken: token }, `${APPLE_NONCE_COOKIE}=attacker`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("apple_invalid_token");
    const tampered = nonceCookie("attacker").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect((await call(link, "POST", { identityToken: token }, tampered)).status).toBe(400);
    expect((await call(link, "POST", { identityToken: token }, nonceCookie("attacker"))).status).toBe(204);
  });
});
