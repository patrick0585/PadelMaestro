import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { appleConfig } from "@/lib/auth/apple/config";
import { revokeRefreshToken } from "@/lib/auth/apple/api";
import { assertFreshAppleProof } from "@/lib/auth/apple/reauth";
import type { AppleIdentity } from "@/lib/auth/apple/verify";
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
  /** Required for accounts with a password; Apple-only accounts have none. */
  password?: string;
  /** Required for Apple-only accounts: a fresh identity token for their own Apple ID. */
  appleProof?: AppleIdentity;
  now?: Date;
}): Promise<void> {
  const { playerId, password } = i;
  const now = i.now ?? new Date();
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      passwordHash: true,
      deletedAt: true,
      appleSub: true,
      appleRefreshToken: true,
      appleClientId: true,
    },
  });
  if (!player || player.deletedAt) throw new PlayerNotFoundError(playerId);
  if (player.passwordHash) {
    if (!password || !(await verifyPassword(password, player.passwordHash))) {
      throw new WrongPasswordError();
    }
  } else if (!player.appleSub) {
    throw new WrongPasswordError();
  } else {
    assertFreshAppleProof(player.appleSub, i.appleProof, now);
  }
  const owned = await prisma.membership.findMany({
    where: { playerId, removedAt: null, role: "owner" },
    select: { group: { select: { id: true, name: true } } },
    orderBy: { group: { name: "asc" } },
  });
  if (owned.length > 0) throw new OwnerOfGroupError(owned.map((m) => m.group));

  try {
    await anonymise(playerId, now);
    await revokeAppleBestEffort(player);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("email")) throw new AnonymisationCollisionError(playerId);
    }
    throw e;
  }
}

// Runs after the account is gone locally; an unreachable Apple must not undo or fail the deletion.
async function revokeAppleBestEffort(player: {
  appleRefreshToken: string | null;
  appleClientId: string | null;
}): Promise<void> {
  const cfg = appleConfig();
  if (!cfg || !player.appleRefreshToken) return;
  const revoked = await revokeRefreshToken(cfg, player.appleRefreshToken, player.appleClientId ?? cfg.bundleId);
  if (!revoked) console.warn("[account] Apple token revoke failed after account deletion");
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
    await tx.pushDevice.deleteMany({ where: { playerId } });
    await tx.auditLog.updateMany({
      where: { entityType: "Player", entityId: playerId },
      data: { payload: { anonymised: true } },
    });
    // deletedAt guard: a concurrent second deletion finds nothing and rolls back.
    const { count } = await tx.player.updateMany({
      where: { id: playerId, deletedAt: null },
      data: {
        name: "Gelöschter Spieler",
        email: `geloescht-${playerId}@anonym.invalid`,
        username: null,
        passwordHash: null,
        appleSub: null,
        appleRefreshToken: null,
        appleClientId: null,
        needsName: false,
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
    if (count !== 1) throw new PlayerNotFoundError(playerId);
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
