import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normaliseUsername } from "@/lib/auth/username";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`duplicate email: ${email}`);
    this.name = "DuplicateEmailError";
  }
}
export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`duplicate username: ${username}`);
    this.name = "DuplicateUsernameError";
  }
}
export class LastAdminError extends Error {
  constructor() {
    super("cannot demote the last remaining admin");
    this.name = "LastAdminError";
  }
}
export class NoFieldsError extends Error {
  constructor() {
    super("no fields to update");
    this.name = "NoFieldsError";
  }
}

export interface UpdatablePlayerFields {
  username?: string | null;
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

export interface UpdatePlayerInput {
  playerId: string;
  actorId: string;
  fields: UpdatablePlayerFields;
}

export interface UpdatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  username: string | null;
}

const TRACKED_FIELDS = ["username", "name", "email", "isAdmin"] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

export async function updatePlayer(input: UpdatePlayerInput): Promise<UpdatedPlayer> {
  const definedFields = Object.fromEntries(
    Object.entries(input.fields).filter(([, v]) => v !== undefined),
  ) as UpdatablePlayerFields;
  if (Object.keys(definedFields).length === 0) throw new NoFieldsError();

  if (typeof definedFields.username === "string") {
    definedFields.username = normaliseUsername(definedFields.username);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.player.findUnique({
        where: { id: input.playerId },
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          username: true,
          deletedAt: true,
        },
      });
      if (!existing || existing.deletedAt) {
        throw new PlayerNotFoundError(input.playerId);
      }

      if (definedFields.isAdmin === false && existing.isAdmin === true) {
        const remaining = await tx.player.count({
          where: { isAdmin: true, deletedAt: null, id: { not: existing.id } },
        });
        if (remaining === 0) throw new LastAdminError();
      }

      const updated = await tx.player.update({
        where: { id: existing.id },
        data: definedFields,
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          username: true,
        },
      });

      const changedFields: TrackedField[] = [];
      const before: Record<TrackedField, string | boolean | null> = {
        username: existing.username,
        name: existing.name,
        email: existing.email,
        isAdmin: existing.isAdmin,
      };
      const after: Record<TrackedField, string | boolean | null> = {
        username: updated.username,
        name: updated.name,
        email: updated.email,
        isAdmin: updated.isAdmin,
      };
      for (const f of TRACKED_FIELDS) {
        if (before[f] !== after[f]) changedFields.push(f);
      }

      if (changedFields.length > 0) {
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            action: "player.update",
            entityType: "Player",
            entityId: existing.id,
            payload: { before, after, changedFields },
          },
        });
      }

      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("username")) {
        throw new DuplicateUsernameError(definedFields.username ?? "");
      }
      if (target.includes("email")) {
        throw new DuplicateEmailError(definedFields.email ?? "");
      }
      throw e;
    }
    throw e;
  }
}
