import { prisma } from "@/lib/db";
import type { GroupRole } from "@/lib/auth/roles";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: GroupRole;
  hasPassword: boolean;
  avatarVersion: number;
};

export async function listActiveMembers(groupId: string): Promise<MemberRow[]> {
  const rows = await prisma.membership.findMany({
    where: { groupId, removedAt: null },
    orderBy: { player: { name: "asc" } },
    select: {
      role: true,
      player: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          passwordHash: true,
          avatarVersion: true,
        },
      },
    },
  });
  return rows.map(({ role, player }) => ({
    id: player.id,
    name: player.name,
    email: player.email,
    username: player.username,
    role,
    hasPassword: player.passwordHash !== null,
    avatarVersion: player.avatarVersion,
  }));
}
