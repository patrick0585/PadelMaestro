// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { appleTestSetup, clearAppleEnv, setAppleEnv } from "../helpers/apple";
import { APPLE_NONCE_COOKIE, resetNoncesForTests } from "@/lib/auth/apple/nonce";
import { rateLimitResetForTests } from "@/lib/rate-limit";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/apple/verify", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/apple/verify")>();
  return {
    ...real,
    verifyAppleIdentityToken: (token: string, opts: Parameters<typeof real.verifyAppleIdentityToken>[1]) =>
      real.verifyAppleIdentityToken(token, { ...opts, keys: keysRef.current }),
  };
});
import { auth } from "@/auth";
import { POST } from "@/app/api/account/apple/link/route";
import { GET as nonceGET } from "@/app/api/auth/apple/nonce/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const keysRef: { current: Awaited<ReturnType<typeof appleTestSetup>>["keys"] | undefined } = { current: undefined };
let t: Awaited<ReturnType<typeof appleTestSetup>>;

const req = (body: unknown, nonce = "nn") =>
  new Request("http://test/api/account/apple/link", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `${APPLE_NONCE_COOKIE}=${nonce}` },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await resetDb();
  resetNoncesForTests();
  rateLimitResetForTests();
  authMock.mockReset();
  t = await appleTestSetup();
  keysRef.current = t.keys;
  setAppleEnv(t.privateKeyPem);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ refresh_token: "rt-link" })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearAppleEnv();
});

describe("POST /api/account/apple/link", () => {
  it("401 without session, 400 on bad body", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(req({}))).status).toBe(401);
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    expect((await POST(req({}))).status).toBe(400);
  });

  it("links the Apple ID and stores the refresh token", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const token = await t.token({ sub: "001.link", nonce: "nn" });
    const res = await POST(req({ identityToken: token, authorizationCode: "c" }));
    expect(res.status).toBe(204);
    expect(await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      appleSub: "001.link",
      appleRefreshToken: "rt-link",
    });
  });

  it("409 when the Apple ID belongs to another account", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    const b = await createMember(g.id, { name: "B", email: "b@example.com" });
    await prisma.player.update({ where: { id: b.id }, data: { appleSub: "001.link" } });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const res = await POST(req({ identityToken: await t.token({ sub: "001.link", nonce: "nn" }) }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("apple_already_linked");
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).appleSub).toBeNull();
  });

  it("400 on a nonce mismatch", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const res = await POST(req({ identityToken: await t.token({ sub: "s", nonce: "other" }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("apple_invalid_token");
  });
});

describe("GET /api/auth/apple/nonce", () => {
  it("returns a nonce and sets it as httpOnly cookie", async () => {
    const res = await nonceGET(new Request("http://test/api/auth/apple/nonce"));
    const { nonce } = await res.json();
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(nonce.length).toBeGreaterThan(20);
    expect(cookie).toContain(`${APPLE_NONCE_COOKIE}=${nonce}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).toContain("Max-Age=600");
  });
});

describe("POST /api/account/apple/link: Randfälle", () => {
  it("503, wenn Apple nicht eingerichtet ist", async () => {
    clearAppleEnv();
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const res = await POST(req({ identityToken: await t.token({ sub: "s", nonce: "nn" }) }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("apple_unavailable");
  });

  it("409, wenn das Konto schon eine andere Apple-ID hat", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    await prisma.player.update({ where: { id: a.id }, data: { appleSub: "001.first" } });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const res = await POST(req({ identityToken: await t.token({ sub: "001.second", nonce: "nn" }) }));
    expect(res.status).toBe(409);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).appleSub).toBe("001.first");
  });

  it("verknüpft auch, wenn der Code-Tausch scheitert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const res = await POST(req({ identityToken: await t.token({ sub: "001.ok", nonce: "nn" }), authorizationCode: "c" }));
    expect(res.status).toBe(204);
    expect(await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({
      appleSub: "001.ok",
      appleRefreshToken: null,
    });
  });

  it("400 bei wiederverwendeter Nonce, Verknüpfung bleibt aus", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    const token = await t.token({ sub: "001.re", nonce: "nn" });
    expect((await POST(req({ identityToken: token }))).status).toBe(204);
    await prisma.player.update({ where: { id: a.id }, data: { appleSub: null } });
    expect((await POST(req({ identityToken: token }))).status).toBe(400);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: a.id } })).appleSub).toBeNull();
  });

  it("429 nach fünf Versuchen pro Minute", async () => {
    const g = await createTestGroup();
    const a = await createMember(g.id, { name: "A", email: "a@example.com" });
    authMock.mockResolvedValue({ user: { id: a.id } });
    for (let i = 0; i < 5; i++) await POST(req({ identityToken: "bad" }));
    expect((await POST(req({ identityToken: "bad" }))).status).toBe(429);
  });
});
