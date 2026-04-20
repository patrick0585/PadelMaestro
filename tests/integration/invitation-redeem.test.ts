import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { generateInvitationToken, invitationExpiryFromNow } from "@/lib/auth/token";
import { verifyPassword } from "@/lib/auth/hash";
import { POST } from "@/app/api/invitations/[token]/route";
import { resetDb } from "../helpers/reset-db";

describe("POST /api/invitations/[token]", () => {
  beforeEach(resetDb);

  it("creates a player with hashed password and marks invitation used", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const token = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        email: "new@example.com",
        token,
        invitedById: admin.id,
        expiresAt: invitationExpiryFromNow(),
      },
    });

    const req = new Request(`http://localhost/api/invitations/${token}`, {
      method: "POST",
      body: JSON.stringify({ name: "Newbie", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ token }) });
    expect(res.status).toBe(201);

    const newbie = await prisma.player.findUniqueOrThrow({ where: { email: "new@example.com" } });
    expect(newbie.name).toBe("Newbie");
    expect(await verifyPassword("hunter22extra", newbie.passwordHash!)).toBe(true);

    const inv = await prisma.invitation.findUniqueOrThrow({ where: { token } });
    expect(inv.usedAt).toBeInstanceOf(Date);
  });

  it("rejects expired invitations", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const token = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        email: "late@example.com",
        token,
        invitedById: admin.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const req = new Request(`http://localhost/api/invitations/${token}`, {
      method: "POST",
      body: JSON.stringify({ name: "Late", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ token }) });
    expect(res.status).toBe(410);
  });
});
