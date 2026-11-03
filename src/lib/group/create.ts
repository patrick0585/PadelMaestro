import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicSignupEnabled } from "@/lib/flags";
import { getOrCreateActiveSeason } from "@/lib/season";
import { uniqueSlug } from "./slug";

export class NotFounderError extends Error {
  constructor() {
    super("Player may not found a group");
    this.name = "NotFounderError";
  }
}

export async function findOpenFounderUse(
  db: Prisma.TransactionClient | PrismaClient,
  playerId: string,
): Promise<{ id: string } | null> {
  return db.invitationUse.findFirst({
    where: { playerId, foundedGroupId: null, invitation: { kind: "founder" } },
    orderBy: { usedAt: "asc" },
    select: { id: true },
  });
}

export async function canFoundGroup(playerId: string): Promise<boolean> {
  return publicSignupEnabled() || (await findOpenFounderUse(prisma, playerId)) !== null;
}

export async function createGroup(i: {
  name: string;
  founderId: string;
  now?: Date;
}): Promise<{ id: string; name: string; slug: string }> {
  const now = i.now ?? new Date();
  const name = i.name.trim();

  const group = await prisma.$transaction(async (tx) => {
    const use = await findOpenFounderUse(tx, i.founderId);
    if (!use && !publicSignupEnabled()) throw new NotFounderError();

    const slug = await uniqueSlug(tx, name);
    const created = await tx.group.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true },
    });
    await tx.membership.create({
      data: { groupId: created.id, playerId: i.founderId, role: "owner", joinedAt: now },
    });
    if (use) {
      const claimed = await tx.invitationUse.updateMany({
        where: { id: use.id, foundedGroupId: null },
        data: { foundedGroupId: created.id },
      });
      if (claimed.count !== 1) throw new NotFounderError();
    }
    await tx.auditLog.create({
      data: {
        actorId: i.founderId,
        groupId: created.id,
        action: "group.create",
        entityType: "Group",
        entityId: created.id,
        payload: { name: created.name, slug: created.slug },
      },
    });
    return created;
  });

  await getOrCreateActiveSeason(group.id);
  return group;
}
