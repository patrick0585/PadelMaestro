import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import type { MemberRow } from "@/lib/group/members";

export type PlayerDetail = MemberRow & {
  joinedAt: Date;
  seasonGold: number;
  seasonPpg: number | null;
};

export async function loadPlayerDetail(
  groupId: string,
  playerId: string,
): Promise<PlayerDetail | null> {
  const membership = await prisma.membership.findFirst({
    where: { groupId, playerId, removedAt: null },
    select: {
      role: true,
      joinedAt: true,
      player: {
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          passwordHash: true,
          emailVerifiedAt: true,
          avatarVersion: true,
        },
      },
    },
  });
  if (!membership) return null;

  const season = await getOrCreateActiveSeason(groupId);
  const stats = await computePlayerSeasonStats(playerId, season.id);
  const { matches } = stats.winRate;
  // Gesamtpunkte = Summe über alle Partner (jedes Spiel hat genau einen)
  const points = stats.partners.reduce((sum, p) => sum + p.pointsTogether, 0);

  const { player } = membership;
  return {
    id: player.id,
    name: player.name,
    email: player.email,
    username: player.username,
    role: membership.role,
    hasPassword: player.passwordHash !== null,
    emailVerified: player.emailVerifiedAt !== null,
    avatarVersion: player.avatarVersion,
    joinedAt: membership.joinedAt,
    seasonGold: stats.medals.gold,
    seasonPpg: matches > 0 ? points / matches : null,
  };
}
