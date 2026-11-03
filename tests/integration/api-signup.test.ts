import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { clearMemoryOutbox } from "@/lib/mail/transport";
import { setTransportForTests } from "@/lib/mail/send";
import { rateLimitResetForTests } from "@/lib/rate-limit";
import { createInvitation } from "@/lib/invitations/create";
import { revokeInvitation } from "@/lib/invitations/manage";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST as signup } from "@/app/api/signup/route";
import { POST as join } from "@/app/api/invitations/join/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(url: string, body?: unknown, ip?: string): Request {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ip && { "x-forwarded-for": ip }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function setup() {
  const group = await createTestGroup();
  const admin = await createMember(group.id, { name: "Admin", email: "admin@example.com", role: "admin" });
  const inv = await createInvitation({ kind: "member", groupId: group.id, createdById: admin.id });
  return { group, admin, inv };
}

const valid = (token: string, over: Record<string, unknown> = {}) => ({
  token,
  name: "Neu Spieler",
  email: "neu@example.com",
  password: "geheim1234",
  acceptTerms: true,
  ...over,
});

beforeEach(async () => {
  await resetDb();
  clearMemoryOutbox();
  rateLimitResetForTests();
  setTransportForTests(null);
  authMock.mockReset();
});

describe("POST /api/signup", () => {
  const call = (body: unknown, ip?: string) => signup(req("/api/signup", body, ip));

  it("201 creates the account and reports kind member with groupId", async () => {
    const { group, inv } = await setup();
    const res = await call(valid(inv.token));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ playerId: expect.any(String), kind: "member", groupId: group.id });
    const p = await prisma.player.findUnique({ where: { id: body.playerId } });
    expect(p?.email).toBe("neu@example.com");
    const m = await prisma.membership.findFirst({ where: { playerId: body.playerId, groupId: group.id } });
    expect(m).not.toBeNull();
  });

  it("400 when acceptTerms is missing or false, or password shorter than 8", async () => {
    const { inv } = await setup();
    const { acceptTerms: _a, ...noTerms } = valid(inv.token);
    for (const body of [noTerms, valid(inv.token, { acceptTerms: false }), valid(inv.token, { password: "kurz123" })]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid" });
    }
    expect(await prisma.player.count({ where: { email: "neu@example.com" } })).toBe(0);
  });

  it("409 email_taken for an existing address", async () => {
    const { inv } = await setup();
    const res = await call(valid(inv.token, { email: "admin@example.com" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "email_taken" });
  });

  it("410 invitation_invalid with reason expired", async () => {
    const { group, admin } = await setup();
    const old = await createInvitation(
      { kind: "member", groupId: group.id, createdById: admin.id },
      new Date(Date.now() - 30 * 24 * 3_600_000),
    );
    const res = await call(valid(old.token));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "invitation_invalid", reason: "expired" });
    expect(await prisma.player.count({ where: { email: "neu@example.com" } })).toBe(0);
  });

  it("429 on the sixth attempt from one IP within an hour", async () => {
    const { inv } = await setup();
    for (let i = 0; i < 5; i++) {
      expect((await call(valid(inv.token, { acceptTerms: false }), "10.1.1.1")).status).toBe(400);
    }
    const res = await call(valid(inv.token), "10.1.1.1");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("POST /api/invitations/join", () => {
  const call = (body: unknown) => join(req("/api/invitations/join", body));

  it("401 without session, 200 outcome joined with session, 200 already_member on repeat", async () => {
    const { group, inv } = await setup();
    const other = await createTestGroup("Andere");
    const me = await createMember(other.id, { name: "Ich", email: "ich@example.com" });

    authMock.mockResolvedValue(null);
    const denied = await call({ token: inv.token });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: "unauthorized" });

    authMock.mockResolvedValue({ user: { id: me.id } });
    const first = await call({ token: inv.token });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ kind: "member", groupId: group.id, outcome: "joined" });
    expect(await prisma.membership.count({ where: { playerId: me.id, groupId: group.id } })).toBe(1);

    const again = await call({ token: inv.token });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ kind: "member", groupId: group.id, outcome: "already_member" });
  });

  it("410 reason revoked", async () => {
    const { group, admin, inv } = await setup();
    await revokeInvitation({ id: inv.id, groupId: group.id, actorId: admin.id });
    const me = await createMember((await createTestGroup("Andere")).id, { name: "Ich", email: "ich@example.com" });
    authMock.mockResolvedValue({ user: { id: me.id } });
    const res = await call({ token: inv.token });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "invitation_invalid", reason: "revoked" });
  });
});
