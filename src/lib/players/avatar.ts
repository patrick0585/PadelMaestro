import sharp from "sharp";
import { prisma } from "@/lib/db";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export class InvalidImageError extends Error {
  constructor() {
    super("invalid image");
    this.name = "InvalidImageError";
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("file too large");
    this.name = "FileTooLargeError";
  }
}

// 5 MB cap; the route layer also sniffs Content-Length, but this is source of truth.
export const MAX_BYTES = 5 * 1024 * 1024;

export interface SetPlayerAvatarInput {
  playerId: string;
  file: Buffer;
  actorId: string;
}

export interface DeletePlayerAvatarInput {
  playerId: string;
  actorId: string;
}

async function processToWebp(file: Buffer): Promise<Buffer> {
  // sharp throws on non-image bytes; surface as InvalidImageError.
  try {
    return await sharp(file)
      .rotate() // normalise EXIF orientation
      .resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new InvalidImageError();
  }
}

async function ensureActivePlayer(playerId: string): Promise<void> {
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw new PlayerNotFoundError(playerId);
}

export async function setPlayerAvatar(input: SetPlayerAvatarInput): Promise<void> {
  if (input.file.length > MAX_BYTES) throw new FileTooLargeError();
  await ensureActivePlayer(input.playerId);
  const avatarData = await processToWebp(input.file);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: {
        avatarData: avatarData as unknown as Uint8Array<ArrayBuffer>,
        avatarMimeType: "image/webp",
        avatarVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.avatar_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { action: "upload" },
      },
    });
  });
}

export async function deletePlayerAvatar(input: DeletePlayerAvatarInput): Promise<void> {
  await ensureActivePlayer(input.playerId);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: {
        avatarData: null,
        avatarMimeType: null,
        avatarVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.avatar_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { action: "delete" },
      },
    });
  });
}

export async function getPlayerAvatar(
  playerId: string,
): Promise<{ data: Buffer; mimeType: string; version: number } | null> {
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { deletedAt: true, avatarData: true, avatarMimeType: true, avatarVersion: true },
  });
  if (!row || row.deletedAt || !row.avatarData || !row.avatarMimeType) return null;
  return {
    data: Buffer.from(row.avatarData),
    mimeType: row.avatarMimeType,
    version: row.avatarVersion,
  };
}
