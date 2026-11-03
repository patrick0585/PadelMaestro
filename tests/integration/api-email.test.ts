import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";
import { rateLimitResetForTests } from "@/lib/rate-limit";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST as changeEmail } from "@/app/api/profile/email/route";
import { POST as resend } from "@/app/api/profile/email/resend/route";
import { POST as confirm } from "@/app/api/email-verification/confirm/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(url: string, body?: unknown, ip?: string): Request {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ip && { "x-forwarded-for": ip }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function member(email: string, emailVerifiedAt: Date | null = new Date()) {
  const group = await createTestGroup();
  return createMember(group.id, { name: "Maxi", email, emailVerifiedAt });
}

function loginAs(id: string) {
  authMock.mockResolvedValue({ user: { id } });
}

function lastToken(): string {
  const m = memoryOutbox.at(-1)?.text.match(/\/email-bestaetigen\/([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error("no link in outbox");
  return m[1];
}

beforeEach(async () => {
  await resetDb();
  clearMemoryOutbox();
  rateLimitResetForTests();
  setTransportForTests(null);
  authMock.mockReset();
});

afterEach(() => setTransportForTests(null));

describe("POST /api/profile/email", () => {
  const call = (body: unknown) => changeEmail(req("/api/profile/email", body));

  it("401 without session", async () => {
    authMock.mockResolvedValue(null);
    expect((await call({ email: "a@b.de" })).status).toBe(401);
  });

  it("204 and sends a mail to the new address", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    const res = await call({ email: "  Neu@Example.com " });
    expect(res.status).toBe(204);
    expect(memoryOutbox.at(-1)?.to).toBe("neu@example.com");
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.pendingEmail).toBe("neu@example.com");
  });

  it("204 without mail when the address is unchanged and verified", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    expect((await call({ email: "alt@example.com" })).status).toBe(204);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("400 on invalid input", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    expect((await call({ email: "kaputt" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
  });

  it("409 email_taken", async () => {
    await member("belegt@example.com");
    const me = await member("alt@example.com");
    loginAs(me.id);
    const res = await call({ email: "belegt@example.com" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("404 for a soft-deleted player", async () => {
    const me = await member("alt@example.com");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    loginAs(me.id);
    expect((await call({ email: "neu@example.com" })).status).toBe(404);
  });

  it("503 mail_failed when the transport fails", async () => {
    setTransportForTests({ send: () => Promise.reject(new Error("down")) });
    const me = await member("alt@example.com");
    loginAs(me.id);
    const res = await call({ email: "neu@example.com" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "mail_failed" });
  });

  it("429 with Retry-After after 5 requests per hour", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    for (let i = 0; i < 5; i++) expect((await call({ email: "alt@example.com" })).status).toBe(204);
    const res = await call({ email: "alt@example.com" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(3500);
  });

  it("limit holds per account across different client IPs", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    const from = (ip: string) => changeEmail(req("/api/profile/email", { email: "alt@example.com" }, ip));
    for (let i = 0; i < 5; i++) expect((await from(i % 2 ? "10.0.0.1" : "10.0.0.2")).status).toBe(204);
    expect((await from("10.0.0.3")).status).toBe(429);
  });
});

describe("POST /api/profile/email/resend", () => {
  const call = () => resend(req("/api/profile/email/resend"));

  it("401 without session", async () => {
    authMock.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("204 and sends a mail for an unverified address", async () => {
    const me = await member("alt@example.com", null);
    loginAs(me.id);
    expect((await call()).status).toBe(204);
    expect(memoryOutbox.at(-1)?.to).toBe("alt@example.com");
  });

  it("404 for a soft-deleted player", async () => {
    const me = await member("alt@example.com", null);
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    loginAs(me.id);
    expect((await call()).status).toBe(404);
  });

  it("503 mail_failed when the transport fails", async () => {
    setTransportForTests({ send: () => Promise.reject(new Error("down")) });
    const me = await member("alt@example.com", null);
    loginAs(me.id);
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "mail_failed" });
  });

  it("429 after 3 requests per hour", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    for (let i = 0; i < 3; i++) expect((await call()).status).toBe(204);
    const res = await call();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("limit holds per account across different client IPs", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    const from = (ip: string) => resend(req("/api/profile/email/resend", undefined, ip));
    for (let i = 0; i < 3; i++) expect((await from(i % 2 ? "10.0.0.1" : "10.0.0.2")).status).toBe(204);
    expect((await from("10.0.0.3")).status).toBe(429);
  });
});

describe("POST /api/email-verification/confirm", () => {
  const call = (body: unknown) => confirm(req("/api/email-verification/confirm", body));

  it("200 with the confirmed email and verifies the player", async () => {
    const me = await member("alt@example.com", null);
    loginAs(me.id);
    await resend(req("/api/profile/email/resend"));
    const res = await call({ token: lastToken() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "alt@example.com" });
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.emailVerifiedAt).not.toBeNull();
  });

  it("400 invalid_token for an unknown token", async () => {
    const res = await call({ token: "x".repeat(43) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("400 invalid_token on malformed input", async () => {
    expect((await call({ token: "kurz" })).status).toBe(400);
    expect((await call({})).status).toBe(400);
  });

  it("409 email_taken when another player took the address meanwhile", async () => {
    const me = await member("alt@example.com");
    loginAs(me.id);
    await changeEmail(req("/api/profile/email", { email: "neu@example.com" }));
    const token = lastToken();
    await member("neu@example.com");
    const res = await call({ token });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("429 after 30 requests per minute", async () => {
    for (let i = 0; i < 30; i++) await call({ token: "x".repeat(43) });
    const res = await call({ token: "x".repeat(43) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});
