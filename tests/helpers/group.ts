import { randomBytes } from "node:crypto";
import type { Group, Player } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdminRole, type GroupRole } from "@/lib/auth/roles";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createTestGroup(name = "Testgruppe"): Promise<Group> {
  const suffix = randomBytes(3).toString("hex");
  return prisma.group.create({ data: { name, slug: `${slugify(name)}-${suffix}` } });
}

export async function createMember(
  groupId: string,
  opts: { name: string; email: string; role?: GroupRole; passwordHash?: string | null },
): Promise<Player> {
  const role = opts.role ?? "member";
  const player = await prisma.player.create({
    data: {
      name: opts.name,
      email: opts.email,
      passwordHash: opts.passwordHash ?? null,
      isAdmin: isAdminRole(role),
    },
  });
  await prisma.membership.create({ data: { groupId, playerId: player.id, role } });
  return player;
}

export function sessionFor(
  player: { id: string; email: string; name: string },
  groupId: string,
  role: GroupRole,
) {
  return {
    user: {
      id: player.id,
      email: player.email,
      name: player.name,
      username: null,
      isAdmin: isAdminRole(role),
      groupId,
      role,
    },
  };
}
