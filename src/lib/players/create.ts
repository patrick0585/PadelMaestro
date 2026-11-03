import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { normaliseUsername } from "@/lib/auth/username";
import { normaliseEmail } from "@/lib/auth/email";
import { roleForAdminFlag } from "@/lib/auth/roles";
import { addToPlannedGameDays } from "@/lib/group/join";
import { DuplicateEmailError, DuplicateUsernameError } from "./errors";
export { DuplicateEmailError, DuplicateUsernameError } from "./errors";

export interface CreatePlayerInput {
  email: string;
  name: string;
  password: string;
  isAdmin: boolean;
  actorId: string;
  groupId: string;
  username?: string;
}

export interface CreatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  username: string | null;
}

export async function createPlayer(input: CreatePlayerInput): Promise<CreatedPlayer> {
  const passwordHash = await hashPassword(input.password);
  const email = normaliseEmail(input.email);
  const username = input.username ? normaliseUsername(input.username) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          email,
          name: input.name,
          passwordHash,
          username,
        },
        select: { id: true, email: true, name: true, username: true },
      });
      await tx.membership.create({
        data: { groupId: input.groupId, playerId: player.id, role: roleForAdminFlag(input.isAdmin) },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          groupId: input.groupId,
          action: "player.create",
          entityType: "Player",
          entityId: player.id,
          payload: {
            email: player.email,
            name: player.name,
            isAdmin: input.isAdmin,
            username: player.username,
          },
        },
      });
      await addToPlannedGameDays(tx, input.groupId, player.id);
      return { ...player, isAdmin: input.isAdmin };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("username")) throw new DuplicateUsernameError(username ?? "");
      if (target.includes("email")) throw new DuplicateEmailError(email);
      throw e;
    }
    throw e;
  }
}
