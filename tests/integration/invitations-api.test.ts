import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST } from "@/app/api/invitations/route";

describe("POST /api/invitations", () => {
  beforeEach(resetDb);

  it("creates an invitation when called by admin", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    vi.mocked(auth).mockResolvedValue({
      user: { id: admin.id, email: admin.email, name: admin.name, isAdmin: true },
    } as never);

    const req = new Request("http://localhost/api/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.url).toContain(body.token);
  });

  it("rejects a non-admin caller with 403", async () => {
    const user = await prisma.player.create({
      data: { name: "U", email: "u@x", passwordHash: "x" },
    });
    vi.mocked(auth).mockResolvedValue({
      user: { id: user.id, email: user.email, name: user.name, isAdmin: false },
    } as never);

    const req = new Request("http://localhost/api/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
