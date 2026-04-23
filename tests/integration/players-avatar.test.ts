// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  setPlayerAvatar,
  deletePlayerAvatar,
  getPlayerAvatar,
  PlayerNotFoundError,
  InvalidImageError,
  FileTooLargeError,
} from "@/lib/players/avatar";

// vi.mock hoisted to file scope so route tests in later describes can reuse it.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const FIXTURE = readFileSync(path.join(__dirname, "../fixtures/avatar-sample.png"));

async function makePlayer(name: string, extra: { isAdmin?: boolean } = {}) {
  return prisma.player.create({
    data: {
      name,
      email: `${name.toLowerCase()}@x`,
      isAdmin: extra.isAdmin ?? false,
    },
  });
}

describe("setPlayerAvatar", () => {
  beforeEach(resetDb);

  it("stores the processed bytes, sets version to 1, and writes an audit log on first upload", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });

    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(1);
    expect(after.avatarMimeType).toBe("image/webp");
    expect(after.avatarData).not.toBeNull();

    const meta = await sharp(after.avatarData!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(me.id);
    expect(logs[0].payload).toMatchObject({ action: "upload" });
  });

  it("increments avatarVersion on replace", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(2);
  });

  it("throws FileTooLargeError for buffers > 5 MB without touching the row", async () => {
    const me = await makePlayer("Me");
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    await expect(
      setPlayerAvatar({ playerId: me.id, file: huge, actorId: me.id }),
    ).rejects.toBeInstanceOf(FileTooLargeError);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(0);
    expect(after.avatarData).toBeNull();
  });

  it("throws InvalidImageError for non-image bytes without touching the row", async () => {
    const me = await makePlayer("Me");
    const junk = Buffer.from("this is not an image");
    await expect(
      setPlayerAvatar({ playerId: me.id, file: junk, actorId: me.id }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(0);
  });

  it("throws PlayerNotFoundError for a soft-deleted player", async () => {
    const me = await makePlayer("Me");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(
      setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("does not write an audit log on InvalidImageError", async () => {
    const me = await makePlayer("Me");
    await expect(
      setPlayerAvatar({ playerId: me.id, file: Buffer.from("nope"), actorId: me.id }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(0);
  });
});

describe("deletePlayerAvatar", () => {
  beforeEach(resetDb);

  it("clears avatarData + avatarMimeType, bumps version, writes audit log with action=delete", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });
    await deletePlayerAvatar({ playerId: me.id, actorId: me.id });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarMimeType).toBeNull();
    expect(after.avatarVersion).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].payload).toMatchObject({ action: "delete" });
  });

  it("throws PlayerNotFoundError for an unknown player", async () => {
    await expect(
      deletePlayerAvatar({ playerId: "00000000-0000-0000-0000-000000000000", actorId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});

describe("getPlayerAvatar", () => {
  beforeEach(resetDb);

  it("returns null when no avatar is set", async () => {
    const me = await makePlayer("Me");
    expect(await getPlayerAvatar(me.id)).toBeNull();
  });

  it("returns { data, mimeType, version } after upload", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });
    const got = await getPlayerAvatar(me.id);
    expect(got).not.toBeNull();
    expect(got!.mimeType).toBe("image/webp");
    expect(got!.version).toBe(1);
    expect(got!.data.length).toBeGreaterThan(0);
  });

  it("returns null for a soft-deleted player even if bytes exist", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id });
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    expect(await getPlayerAvatar(me.id)).toBeNull();
  });
});

import { POST, DELETE } from "@/app/api/profile/avatar/route";

function multipartRequest(url: string, file: Buffer | null, method: "POST" | "DELETE" = "POST"): Request {
  if (file === null) {
    return new Request(url, { method });
  }
  const body = new FormData();
  const blob = new Blob([file as unknown as BlobPart], { type: "image/png" });
  body.append("file", blob, "avatar.png");
  return new Request(url, { method, body });
}

describe("POST /api/profile/avatar", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the file field is missing", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const req = new Request("http://test/api/profile/avatar", { method: "POST", body: new FormData() });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-image bytes", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(
      multipartRequest("http://test/api/profile/avatar", Buffer.from("not-an-image")),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_image");
  });

  it("returns 413 for a > 5 MB file", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await POST(multipartRequest("http://test/api/profile/avatar", big));
    expect(res.status).toBe(413);
  });

  it("returns 200 with { version } on success and stores WebP bytes", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ version: 1 });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarMimeType).toBe("image/webp");
    expect(after.avatarVersion).toBe(1);
  });
});

describe("DELETE /api/profile/avatar", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request("http://test/api/profile/avatar", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("returns 204 and clears the row for an authenticated user", async () => {
    const me = await makePlayer("Me");
    // seed an avatar first
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));

    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await DELETE(new Request("http://test/api/profile/avatar", { method: "DELETE" }));
    expect(res.status).toBe(204);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarVersion).toBe(2);
  });
});
