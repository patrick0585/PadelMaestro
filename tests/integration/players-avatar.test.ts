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

async function makePlayer(name: string) {
  return prisma.player.create({
    data: {
      name,
      email: `${name.toLowerCase()}@x`,
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

  it("does not throw FileTooLargeError at exactly MAX_BYTES (5 MB)", async () => {
    // 5 MB of zero bytes is not a valid image, so we expect InvalidImageError
    // from sharp — not FileTooLargeError. That confirms the boundary is `> MAX_BYTES`.
    const me = await makePlayer("Me");
    const edge = Buffer.alloc(5 * 1024 * 1024, 0);
    await expect(
      setPlayerAvatar({ playerId: me.id, file: edge, actorId: me.id }),
    ).rejects.toBeInstanceOf(InvalidImageError);
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

  it("returns 413 immediately via Content-Length fast-reject without reading the body", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const req = new Request("http://test/api/profile/avatar", {
      method: "POST",
      headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      body: "tiny",
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(0);
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

import { PUT as adminPut, DELETE as adminDelete, GET as adminGet } from "@/app/api/players/[id]/avatar/route";
import { createMember, createTestGroup, sessionFor, setupGroupWithAdmin } from "../helpers/group";

const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

function adminMultipart(url: string, file: Buffer): Request {
  const body = new FormData();
  body.append("file", new Blob([file as unknown as BlobPart], { type: "image/png" }), "avatar.png");
  return new Request(url, { method: "PUT", body });
}

function putAvatar(targetId: string, file: Buffer = FIXTURE) {
  return adminPut(adminMultipart(`http://test/api/players/${targetId}/avatar`, file), {
    params: Promise.resolve({ id: targetId }),
  });
}

function deleteAvatar(targetId: string) {
  return adminDelete(
    new Request(`http://test/api/players/${targetId}/avatar`, { method: "DELETE" }),
    { params: Promise.resolve({ id: targetId }) },
  );
}

function getAvatar(targetId: string) {
  return adminGet(new Request(`http://test/api/players/${targetId}/avatar`), {
    params: Promise.resolve({ id: targetId }),
  });
}

async function setupForeignTarget() {
  const other = await createTestGroup("Andere");
  return createMember(other.id, { name: "Fremd", email: "fremd@example.com" });
}

async function removeMembership(groupId: string, playerId: string) {
  await prisma.membership.updateMany({
    where: { groupId, playerId },
    data: { removedAt: new Date() },
  });
}

describe("PUT /api/players/[id]/avatar (admin)", () => {
  beforeEach(resetDb);

  it("returns 401 without a session", async () => {
    const { group } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(null);
    expect((await putAvatar(target.id)).status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const { group } = await setupGroupWithAdmin();
    const member = await createMember(group.id, { name: "Member", email: "member@example.com" });
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(sessionFor(member, group.id, "member"));
    expect((await putAvatar(target.id)).status).toBe(403);
  });

  it("returns 404 for a missing player", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValueOnce(session);
    expect((await putAvatar(UNKNOWN_ID)).status).toBe(404);
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const foreign = await setupForeignTarget();
    authMock.mockResolvedValueOnce(session);
    const res = await putAvatar(foreign.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.avatarVersion).toBe(0);
  });

  it("returns 404 for a removed member of the group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const gone = await createMember(group.id, { name: "Gone", email: "gone@example.com" });
    await removeMembership(group.id, gone.id);
    authMock.mockResolvedValueOnce(session);
    const res = await putAvatar(gone.id);
    expect(res.status).toBe(404);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: gone.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.avatarVersion).toBe(0);
  });

  it("returns 413 for a > 5 MB file", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(session);
    const res = await putAvatar(target.id, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it("returns 413 immediately via Content-Length fast-reject without reading the body", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(session);
    const req = new Request(`http://test/api/players/${target.id}/avatar`, {
      method: "PUT",
      headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      body: "tiny",
    });
    const res = await adminPut(req, { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(413);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.avatarVersion).toBe(0);
  });

  it("returns 200 with { version } on success and records admin as actor", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(session);
    const res = await putAvatar(target.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1 });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
  });
});

describe("DELETE /api/players/[id]/avatar (admin)", () => {
  beforeEach(resetDb);

  it("clears the target avatar and records the admin as actor", async () => {
    const { group, admin, session } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(session);
    await putAvatar(target.id);

    authMock.mockResolvedValueOnce(session);
    const res = await deleteAvatar(target.id);
    expect(res.status).toBe(204);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarVersion).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.avatar_change" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs[1].actorId).toBe(admin.id);
  });

  it("returns 403 for non-admin", async () => {
    const { group } = await setupGroupWithAdmin();
    const nobody = await createMember(group.id, { name: "Nobody", email: "nobody@example.com" });
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(sessionFor(nobody, group.id, "member"));
    expect((await deleteAvatar(target.id)).status).toBe(403);
  });

  it("returns 401 without a session", async () => {
    const { group } = await setupGroupWithAdmin();
    const target = await createMember(group.id, { name: "Target", email: "target@example.com" });
    authMock.mockResolvedValueOnce(null);
    expect((await deleteAvatar(target.id)).status).toBe(401);
  });

  it("returns 404 for a missing player", async () => {
    const { session } = await setupGroupWithAdmin();
    authMock.mockResolvedValueOnce(session);
    expect((await deleteAvatar(UNKNOWN_ID)).status).toBe(404);
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const foreign = await setupForeignTarget();
    await setPlayerAvatar({ playerId: foreign.id, actorId: foreign.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(session);
    const res = await deleteAvatar(foreign.id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.avatarVersion).toBe(1);
  });

  it("returns 404 for a removed member of the group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const gone = await createMember(group.id, { name: "Gone", email: "gone@example.com" });
    await setPlayerAvatar({ playerId: gone.id, actorId: gone.id, file: FIXTURE });
    await removeMembership(group.id, gone.id);
    authMock.mockResolvedValueOnce(session);
    const res = await deleteAvatar(gone.id);
    expect(res.status).toBe(404);
    const after = await prisma.player.findUniqueOrThrow({ where: { id: gone.id } });
    expect(after.deletedAt).toBeNull();
    expect(after.avatarVersion).toBe(1);
  });
});

describe("GET /api/players/[id]/avatar", () => {
  beforeEach(resetDb);

  it("returns 404 when the player has no avatar", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const me = await createMember(group.id, { name: "Me", email: "me@example.com" });
    authMock.mockResolvedValueOnce(sessionFor(admin, group.id, "owner"));
    expect((await getAvatar(me.id)).status).toBe(404);
  });

  it("returns the bytes with Content-Type image/webp and an immutable Cache-Control", async () => {
    const { group } = await setupGroupWithAdmin();
    const me = await createMember(group.id, { name: "Me", email: "me@example.com" });
    await setPlayerAvatar({ playerId: me.id, actorId: me.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(sessionFor(me, group.id, "member"));
    const res = await getAvatar(me.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("etag")).toBe(`"${me.id}-1"`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
  });

  it("serves another active member's avatar within the group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const other = await createMember(group.id, { name: "Other", email: "other@example.com" });
    await setPlayerAvatar({ playerId: other.id, actorId: other.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(session);
    expect((await getAvatar(other.id)).status).toBe(200);
  });

  it("returns 401 when not logged in", async () => {
    const { group } = await setupGroupWithAdmin();
    const me = await createMember(group.id, { name: "Me", email: "me@example.com" });
    await setPlayerAvatar({ playerId: me.id, actorId: me.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(null);
    expect((await getAvatar(me.id)).status).toBe(401);
  });

  it("returns 404 for a player of another group", async () => {
    const { session } = await setupGroupWithAdmin();
    const foreign = await setupForeignTarget();
    await setPlayerAvatar({ playerId: foreign.id, actorId: foreign.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(session);
    expect((await getAvatar(foreign.id)).status).toBe(404);
  });

  it("returns 404 for a removed member of the group", async () => {
    const { group, session } = await setupGroupWithAdmin();
    const gone = await createMember(group.id, { name: "Gone", email: "gone@example.com" });
    await setPlayerAvatar({ playerId: gone.id, actorId: gone.id, file: FIXTURE });
    await prisma.membership.updateMany({
      where: { groupId: group.id, playerId: gone.id },
      data: { removedAt: new Date() },
    });
    authMock.mockResolvedValueOnce(session);
    expect((await getAvatar(gone.id)).status).toBe(404);
  });

  it("returns 200 for the own avatar without a group", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, actorId: me.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(sessionFor(me, null, null));
    expect((await getAvatar(me.id)).status).toBe(200);
  });

  it("returns 404 for a foreign avatar without a group", async () => {
    const { group } = await setupGroupWithAdmin();
    const other = await createMember(group.id, { name: "Other", email: "other@example.com" });
    await setPlayerAvatar({ playerId: other.id, actorId: other.id, file: FIXTURE });
    const loner = await makePlayer("Loner");
    authMock.mockResolvedValueOnce(sessionFor(loner, null, null));
    expect((await getAvatar(other.id)).status).toBe(404);
  });
});
