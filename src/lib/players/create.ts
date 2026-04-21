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
  const existing = await prisma.player.findUnique({ where: { email: input.email } });
  if (existing) throw new DuplicateEmailError(input.email);

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
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
    return player;
  });
}
