import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { normaliseUsername } from "@/lib/auth/username";
import { roleForAdminFlag } from "@/lib/auth/roles";

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
  const username = input.username ? normaliseUsername(input.username) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          email: input.email,
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
      const plannedDays = await tx.gameDay.findMany({
        where: { status: "planned", groupId: input.groupId },
        select: { id: true },
      });
      if (plannedDays.length > 0) {
        await tx.gameDayParticipant.createMany({
          data: plannedDays.map((d) => ({ gameDayId: d.id, playerId: player.id })),
          skipDuplicates: true,
        });
      }
      return { ...player, isAdmin: input.isAdmin };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("username")) throw new DuplicateUsernameError(username ?? "");
      if (target.includes("email")) throw new DuplicateEmailError(input.email);
      throw e;
    }
    throw e;
  }
}
