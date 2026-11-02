import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import type { GroupRole } from "@/lib/auth/roles";
import { getSoleGroup } from "./sole-group";

export class PlayerExistsError extends Error {
  constructor(email: string) {
    super(`Player with email ${email} already exists`);
    this.name = "PlayerExistsError";
  }
}

export async function bootstrapAdmin(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ playerId: string; groupId: string; role: GroupRole }> {
  const existing = await prisma.player.findUnique({ where: { email: input.email } });
  if (existing) throw new PlayerExistsError(input.email);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const group = await getSoleGroup(tx);
    const hasOwner = await tx.membership.count({
      where: { groupId: group.id, role: "owner", removedAt: null },
    });
    const role: GroupRole = hasOwner > 0 ? "admin" : "owner";
    const player = await tx.player.create({
      data: { name: input.name, email: input.email, passwordHash, isAdmin: true },
    });
    await tx.membership.create({ data: { groupId: group.id, playerId: player.id, role } });
    return { playerId: player.id, groupId: group.id, role };
  });
}
