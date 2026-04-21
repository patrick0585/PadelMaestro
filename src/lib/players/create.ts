import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`duplicate email: ${email}`);
    this.name = "DuplicateEmailError";
  }
}

export interface CreatePlayerInput {
  email: string;
  name: string;
  password: string;
  isAdmin: boolean;
  actorId: string;
}

export interface CreatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export async function createPlayer(input: CreatePlayerInput): Promise<CreatedPlayer> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          email: input.email,
          name: input.name,
          isAdmin: input.isAdmin,
          passwordHash,
        },
        select: { id: true, email: true, name: true, isAdmin: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "player.create",
          entityType: "Player",
          entityId: player.id,
          payload: { email: player.email, name: player.name, isAdmin: player.isAdmin },
        },
      });
      const plannedDays = await tx.gameDay.findMany({
        where: { status: "planned" },
        select: { id: true },
      });
      if (plannedDays.length > 0) {
        await tx.gameDayParticipant.createMany({
          data: plannedDays.map((d) => ({ gameDayId: d.id, playerId: player.id })),
          skipDuplicates: true,
        });
      }
      return player;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DuplicateEmailError(input.email);
    }
    throw e;
  }
}
