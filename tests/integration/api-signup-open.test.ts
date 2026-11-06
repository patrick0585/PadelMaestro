import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { clearMemoryOutbox, memoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";
import { rateLimitResetForTests } from "@/lib/rate-limit";
import { POST as signup } from "@/app/api/signup/route";

function req(body: unknown, ip = "10.0.0.1"): Request {
  return new Request("http://test/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Max Müller",
  email: "max@example.com",
  password: "geheim1234",
  acceptTerms: true,
  ...over,
});

describe("POST /api/signup ohne Einladung", () => {
  beforeEach(async () => {
    await resetDb();
    rateLimitResetForTests();
    clearMemoryOutbox();
    setTransportForTests(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ist gesperrt, solange die offene Registrierung aus ist", async () => {
    const res = await signup(req(valid()));
    expect(res.status).toBe(403);
    expect(await prisma.player.count()).toBe(0);
  });

  it("legt ein Konto ohne Gruppe an und schickt die Bestätigungsmail", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const res = await signup(req(valid()));
    expect(res.status).toBe(201);
    const p = await prisma.player.findFirstOrThrow({ where: { email: "max@example.com" } });
    expect(p.name).toBe("Max Müller");
    expect(p.termsAcceptedAt).not.toBeNull();
    expect(p.emailVerifiedAt).toBeNull();
    expect(await prisma.membership.count({ where: { playerId: p.id } })).toBe(0);
    expect(memoryOutbox.some((m) => m.to === "max@example.com")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "player.signup", entityId: p.id } })).toBe(1);
  });

  it("meldet eine schon vergebene Adresse", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    await signup(req(valid()));
    const res = await signup(req(valid({ name: "Anderer" }), "10.0.0.2"));
    expect(res.status).toBe(409);
  });

  it("ohne Zustimmung oder mit gefülltem Bot-Feld kein Konto", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    expect((await signup(req(valid({ acceptTerms: false })))).status).toBe(400);
    expect((await signup(req(valid({ company_url: "http://spam" })))).status).toBe(400);
    expect(await prisma.player.count()).toBe(0);
  });

  it("höchstens 5 neue Konten pro Stunde und Netz", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await signup(req(valid({ email: `p${i}@example.com` })))).status);
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("eine fremde, nie bestätigte Anmeldung blockiert die Adresse nicht dauerhaft", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    await signup(req(valid({ name: "Fremder", password: "fremd12345" }), "10.0.0.7"));
    const squat = await prisma.player.findFirstOrThrow({ where: { email: "max@example.com" } });
    await prisma.player.update({ where: { id: squat.id }, data: { pendingEmail: "angreifer@example.com" } });
    await prisma.pushDevice.create({ data: { playerId: squat.id, token: "squatter-device", platform: "ios" } });
    // Frisch: noch geschützt, der echte Besitzer könnte gerade die Mail bestätigen.
    expect((await signup(req(valid(), "10.0.0.8"))).status).toBe(409);
    // Nach 24 Stunden unbestätigt und ohne Spuren: wird stillgelegt, ein neues Konto entsteht.
    await prisma.player.update({ where: { id: squat.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    clearMemoryOutbox();
    expect((await signup(req(valid(), "10.0.0.9"))).status).toBe(201);
    const fresh = await prisma.player.findFirstOrThrow({ where: { email: "max@example.com" } });
    expect(fresh.id).not.toBe(squat.id);
    expect(fresh.name).toBe("Max Müller");
    expect(fresh.pendingEmail).toBeNull();
    expect(await prisma.pushDevice.count({ where: { playerId: fresh.id } })).toBe(0);
    expect(await prisma.pushDevice.count({ where: { playerId: squat.id } })).toBe(0);
    expect(await prisma.emailToken.count({ where: { playerId: squat.id } })).toBe(0);
    const old = await prisma.player.findUniqueOrThrow({ where: { id: squat.id } });
    expect(old.deletedAt).not.toBeNull();
    expect(old.passwordHash).toBeNull();
    // Die Bestätigung geht an die echte Adresse, nicht an eine Adresse des Vorbesitzers.
    expect(memoryOutbox.map((m) => m.to)).toEqual(["max@example.com"]);
  });

  it("ein altes unbestätigtes Konto mit Spuren (frühere Gruppe) bleibt geschützt", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const old = new Date(Date.now() - 48 * 3600_000);
    const p = await prisma.player.create({ data: { name: "Ehemalig", email: "max@example.com", passwordHash: "x", createdAt: old } });
    const g = await prisma.group.create({ data: { name: "Alt", slug: "alt" } });
    await prisma.membership.create({ data: { groupId: g.id, playerId: p.id, role: "member", joinedAt: old, removedAt: old } });
    expect((await signup(req(valid()))).status).toBe(409);
  });

  it("bestätigte oder in Gruppen aktive Konten werden nie übernommen", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    const old = new Date(Date.now() - 48 * 3600_000);
    await prisma.player.create({ data: { name: "Echt", email: "max@example.com", passwordHash: "x", emailVerifiedAt: old, createdAt: old } });
    expect((await signup(req(valid()))).status).toBe(409);
    expect((await prisma.player.findFirstOrThrow({ where: { email: "max@example.com" } })).name).toBe("Echt");
  });

  it("Grenze pro Adresse zählt nur verschickte Bestätigungen, nicht abgewiesene Versuche", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    // Drei abgewiesene Versuche (Adresse vergeben) dürfen die Adresse nicht für 24 h sperren.
    await prisma.player.create({ data: { name: "Echt", email: "same@example.com", passwordHash: "x", emailVerifiedAt: new Date() } });
    for (let i = 0; i < 3; i++) expect((await signup(req(valid({ email: "same@example.com" }), `10.1.0.${i}`))).status).toBe(409);
    expect((await signup(req(valid({ email: "other@example.com" }), "10.1.0.8"))).status).toBe(201);
  });

  it("Müll-Anfragen verbrauchen die Gesamtgrenze nicht", async () => {
    vi.stubEnv("PUBLIC_SIGNUP", "true");
    for (let i = 0; i < 60; i++) await signup(req({ junk: true }, `10.2.${Math.floor(i / 5)}.${i % 5}`));
    expect((await signup(req(valid({ email: "real@example.com" }), "10.3.0.1"))).status).toBe(201);
  });
});
