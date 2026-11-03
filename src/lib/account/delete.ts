import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { PlayerNotFoundError, WrongPasswordError } from "./errors";

export class OwnerOfGroupError extends Error {
  constructor(public readonly groups: { id: string; name: string }[]) {
    super("player still owns groups");
    this.name = "OwnerOfGroupError";
  }
}

export class AnonymisationCollisionError extends Error {
  constructor(playerId: string) {
    super(`anonymised e-mail already taken for ${playerId}`);
    this.name = "AnonymisationCollisionError";
  }
}

export async function deleteOwnAccount(i: {
  playerId: string;
  password: string;
  now?: Date;
}): Promise<void> {
  const { playerId, password } = i;
  const now = i.now ?? new Date();
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, passwordHash: true, deletedAt: true },
  });
  if (!player || player.deletedAt) throw new PlayerNotFoundError(playerId);
  if (!player.passwordHash || !(await verifyPassword(password, player.passwordHash))) {
    throw new WrongPasswordError();
  }
  const owned = await prisma.membership.findMany({
    where: { playerId, removedAt: null, role: "owner" },
    select: { group: { select: { id: true, name: true } } },
    orderBy: { group: { name: "asc" } },
  });
  if (owned.length > 0) throw new OwnerOfGroupError(owned.map((m) => m.group));

  try {
    await anonymise(playerId, now);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("email")) throw new AnonymisationCollisionError(playerId);
    }
    throw e;
  }
}

async function anonymise(playerId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { playerId, removedAt: null },
      data: { removedAt: now },
    });
    // Re-checked after the update has locked the rows: a concurrent transfer may
    // have made the player owner since the check above.
    const lateOwned = await tx.membership.findMany({
      where: { playerId, role: "owner", removedAt: now },
      select: { group: { select: { id: true, name: true } } },
      orderBy: { group: { name: "asc" } },
    });
    if (lateOwned.length > 0) throw new OwnerOfGroupError(lateOwned.map((m) => m.group));
    await tx.jokerUse.deleteMany({
      where: { playerId, gameDay: { status: "planned" } },
    });
    await tx.gameDayParticipant.deleteMany({
      where: { playerId, gameDay: { status: "planned" } },
    });
    await tx.emailToken.deleteMany({ where: { playerId } });
    await tx.auditLog.updateMany({
      where: { entityType: "Player", entityId: playerId },
      data: { payload: { anonymised: true } },
    });
    await tx.player.update({
      where: { id: playerId },
      data: {
        name: "Gelöschter Spieler",
        email: `geloescht-${playerId}@anonym.invalid`,
        username: null,
        passwordHash: null,
        pendingEmail: null,
        emailVerifiedAt: null,
        avatarData: null,
        avatarMimeType: null,
        avatarVersion: 0,
        telegramId: null,
        activeGroupId: null,
        deletedAt: now,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: playerId,
        groupId: null,
        action: "account.delete",
        entityType: "Player",
        entityId: playerId,
      },
    });
  });
}
