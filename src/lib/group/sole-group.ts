import type { Group, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DEFAULT_GROUP_NAME = "Padelmaestro";
export const DEFAULT_GROUP_SLUG = "padelmaestro";

export class AmbiguousGroupError extends Error {
  constructor() {
    super("expected exactly one group, found several");
    this.name = "AmbiguousGroupError";
  }
}

export async function getSoleGroup(tx?: Prisma.TransactionClient): Promise<Group> {
  const db = tx ?? prisma;
  const groups = await db.group.findMany({ take: 2 });
  if (groups.length > 1) throw new AmbiguousGroupError();
  if (groups.length === 1) return groups[0];
  return db.group.create({
    data: { name: DEFAULT_GROUP_NAME, slug: DEFAULT_GROUP_SLUG },
  });
}
