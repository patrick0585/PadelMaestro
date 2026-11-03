import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";
import { rateLimitResetForTests } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth/hash";
import { POST as requestReset } from "@/app/api/password-reset/request/route";
import { POST as confirmReset } from "@/app/api/password-reset/confirm/route";

function req(url: string, body: unknown, ip = "1.1.1.1"): Request {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function member(email: string, emailVerifiedAt: Date | null = new Date()) {
  const group = await createTestGroup();
  return createMember(group.id, { name: "Maxi", email, emailVerifiedAt });
}

function lastToken(): string {
  const m = memoryOutbox.at(-1)?.text.match(/\/passwort-zuruecksetzen\/([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error("no link in outbox");
  return m[1];
}

beforeEach(async () => {
  await resetDb();
  clearMemoryOutbox();
  rateLimitResetForTests();
  setTransportForTests(null);
});

afterEach(() => setTransportForTests(null));

describe("POST /api/password-reset/request", () => {
  const call = (body: unknown, ip?: string) =>
    requestReset(req("/api/password-reset/request", body, ip));

  it("204 and sends a mail for a verified address", async () => {
    await member("maxi@example.com");
    expect((await call({ email: " Maxi@Example.com" })).status).toBe(204);
    expect(memoryOutbox).toHaveLength(1);
    expect(memoryOutbox[0].to).toBe("maxi@example.com");
  });

  it("204 without mail for unknown and unverified addresses", async () => {
    await member("offen@example.com", null);
    expect((await call({ email: "nobody@example.com" })).status).toBe(204);
    expect((await call({ email: "offen@example.com" })).status).toBe(204);
    expect(memoryOutbox).toHaveLength(0);
  });

  it("400 invalid on bad input", async () => {
    const res = await call({ email: "kaputt" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
    expect((await call({})).status).toBe(400);
  });

  it("503 mail_failed when the transport fails", async () => {
    setTransportForTests({ send: () => Promise.reject(new Error("down")) });
    await member("maxi@example.com");
    const res = await call({ email: "maxi@example.com" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "mail_failed" });
  });

  it("429 per address after 3 requests per hour, across IPs", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await call({ email: "maxi@example.com" }, `2.2.2.${i}`)).status).toBe(204);
    }
    const res = await call({ email: "Maxi@example.com" }, "2.2.2.9");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });

  it("429 per IP after 10 requests per hour", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await call({ email: `u${i}@example.com` })).status).toBe(204);
    }
    const res = await call({ email: "u11@example.com" });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    // Other IP is unaffected.
    expect((await call({ email: "u11@example.com" }, "9.9.9.9")).status).toBe(204);
  });
});

describe("POST /api/password-reset/confirm", () => {
  const call = (body: unknown) => confirmReset(req("/api/password-reset/confirm", body));

  it("204 and sets the new password", async () => {
    const me = await member("maxi@example.com");
    await requestReset(req("/api/password-reset/request", { email: "maxi@example.com" }));
    expect((await call({ token: lastToken(), newPassword: "neuespasswort" })).status).toBe(204);
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("neuespasswort", stored.passwordHash!)).toBe(true);
  });

  it("400 invalid_token for unknown or reused token", async () => {
    const res = await call({ token: "x".repeat(43), newPassword: "neuespasswort" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_token" });

    await member("maxi@example.com");
    await requestReset(req("/api/password-reset/request", { email: "maxi@example.com" }));
    const token = lastToken();
    expect((await call({ token, newPassword: "neuespasswort" })).status).toBe(204);
    expect((await call({ token, newPassword: "nochmalnoch" })).status).toBe(400);
  });

  it("400 invalid on schema violations", async () => {
    const token = "x".repeat(43);
    for (const body of [
      { token, newPassword: "short" },
      { token, newPassword: "x".repeat(73) },
      { token: "kurz", newPassword: "neuespasswort" },
      {},
    ]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid" });
    }
  });

  it("429 after 30 requests per minute", async () => {
    // Invalid bodies skip the slow password hash but still count.
    for (let i = 0; i < 30; i++) await call({});
    const res = await call({});
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});
