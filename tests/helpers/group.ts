import { randomBytes } from "node:crypto";
import type { GameDay, Group, Player, Prisma, Season } from "@prisma/client";
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
  opts: {
    name: string;
    email: string;
    role?: GroupRole;
    passwordHash?: string | null;
    username?: string | null;
    emailVerifiedAt?: Date | null;
  },
): Promise<Player> {
  const role = opts.role ?? "member";
  const player = await prisma.player.create({
    data: {
      name: opts.name,
      email: opts.email,
      passwordHash: opts.passwordHash ?? null,
      username: opts.username ?? null,
      emailVerifiedAt: opts.emailVerifiedAt ?? null,
    },
  });
  await prisma.membership.create({ data: { groupId, playerId: player.id, role } });
  return player;
}

export function sessionFor(
  player: { id: string; email: string; name: string },
  groupId: string | null,
  role: GroupRole | null,
) {
  return {
    user: {
      id: player.id,
      email: player.email,
      name: player.name,
      username: null,
      isAdmin: role !== null && isAdminRole(role),
      groupId,
      role,
    },
  };
}

export async function createTestSeason(
  groupId: string,
  overrides: Partial<Prisma.SeasonUncheckedCreateInput> = {},
): Promise<Season> {
  const year = new Date().getUTCFullYear();
  return prisma.season.create({
    data: {
      groupId,
      name: `Saison ${year}-${randomBytes(3).toString("hex")}`,
      year,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      isActive: true,
      ...overrides,
    },
  });
}

export async function createTestGameDay(
  groupId: string,
  seasonId: string,
  overrides: Partial<Prisma.GameDayUncheckedCreateInput> = {},
): Promise<GameDay> {
  const now = new Date();
  return prisma.gameDay.create({
    data: {
      groupId,
      seasonId,
      date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      status: "planned",
      playerCount: 4,
      ...overrides,
    },
  });
}

export async function setupGroupWithAdmin(
  role: "owner" | "admin" = "owner",
): Promise<{ group: Group; admin: Player; session: ReturnType<typeof sessionFor> }> {
  const group = await createTestGroup();
  const admin = await createMember(group.id, {
    name: "Admin",
    email: "admin@example.com",
    role,
    passwordHash: "x",
  });
  return { group, admin, session: sessionFor(admin, group.id, role) };
}
