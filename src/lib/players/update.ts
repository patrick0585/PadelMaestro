import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normaliseUsername } from "@/lib/auth/username";
import { normaliseEmail } from "@/lib/auth/email";
import {
  countOtherAdmins,
  findGroupMembership,
  isSharedAccount,
} from "@/lib/group/active-membership";
import { isAdminRole, roleForAdminFlag } from "@/lib/auth/roles";
import { revokeOpenTokens } from "@/lib/account/tokens";
import {
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdminError,
  OwnerProtectedError,
  PlayerNotFoundError,
  SharedAccountError,
} from "./errors";

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
  role?: "member" | "admin";
}

export interface UpdatePlayerInput {
  groupId: string;
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

  if (typeof definedFields.email === "string") {
    definedFields.email = normaliseEmail(definedFields.email);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.player.findUnique({
        where: { id: input.playerId },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          deletedAt: true,
        },
      });
      const membership = await findGroupMembership(tx, input.groupId, input.playerId);
      if (!existing || existing.deletedAt || !membership) {
        throw new PlayerNotFoundError(input.playerId);
      }

      const emailChanged =
        definedFields.email !== undefined && definedFields.email !== existing.email;
      if (!emailChanged) delete definedFields.email;

      if (
        emailChanged &&
        membership.role === "owner" &&
        input.actorId !== input.playerId
      ) {
        throw new OwnerProtectedError("only the owner may change the owner's email");
      }

      const accountChanged =
        emailChanged ||
        (definedFields.name !== undefined && definedFields.name !== existing.name) ||
        (definedFields.username !== undefined && definedFields.username !== existing.username);
      if (
        accountChanged &&
        input.actorId !== input.playerId &&
        (await isSharedAccount(tx, existing.id, input.groupId))
      ) {
        throw new SharedAccountError();
      }

      const targetRole =
        definedFields.role ??
        (definedFields.isAdmin === undefined ? undefined : roleForAdminFlag(definedFields.isAdmin));
      if (targetRole === "member" && membership.role === "owner") {
        throw new OwnerProtectedError();
      }
      if (
        targetRole === "member" &&
        membership.role === "admin" &&
        (await countOtherAdmins(tx, input.groupId, existing.id)) === 0
      ) {
        throw new LastAdminError();
      }

      const { username, name, email } = definedFields;
      const hasPlayerChanges = username !== undefined || name !== undefined || emailChanged;
      const updatedPlayer = hasPlayerChanges
        ? await tx.player.update({
            where: { id: existing.id },
            data: {
              username,
              name,
              email,
              ...(emailChanged ? { emailVerifiedAt: null, pendingEmail: null } : {}),
            },
            select: { id: true, email: true, name: true, username: true },
          })
        : { id: existing.id, email: existing.email, name: existing.name, username: existing.username };
      if (emailChanged) await revokeOpenTokens(tx, existing.id);

      let role = membership.role;
      if (targetRole !== undefined && role !== "owner") {
        role = targetRole;
        // Re-checked under the row lock: a concurrent ownership transfer may have promoted the target.
        const changed = await tx.membership.updateMany({
          where: {
            groupId: input.groupId,
            playerId: existing.id,
            removedAt: null,
            role: { not: "owner" },
          },
          data: { role },
        });
        if (changed.count !== 1) {
          const current = await findGroupMembership(tx, input.groupId, existing.id);
          if (current?.role === "owner") throw new OwnerProtectedError();
          throw new PlayerNotFoundError(input.playerId);
        }
      }
      const updated: UpdatedPlayer = { ...updatedPlayer, isAdmin: isAdminRole(role) };

      const changedFields: TrackedField[] = [];
      const before: Record<TrackedField | "role", string | boolean | null> = {
        username: existing.username,
        name: existing.name,
        email: existing.email,
        isAdmin: isAdminRole(membership.role),
        role: membership.role,
      };
      const after: Record<TrackedField | "role", string | boolean | null> = {
        username: updated.username,
        name: updated.name,
        email: updated.email,
        isAdmin: updated.isAdmin,
        role,
      };
      for (const f of TRACKED_FIELDS) {
        if (before[f] !== after[f]) changedFields.push(f);
      }

      if (changedFields.length > 0) {
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            groupId: input.groupId,
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
