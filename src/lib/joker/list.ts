import { prisma } from "@/lib/db";

export interface JokerUseRow {
  playerId: string;
  playerName: string;
  avatarVersion: number;
  ppgAtUse: number;
  gamesCredited: number;
  pointsCredited: number;
}

export async function listJokersForGameDay(
  gameDayId: string,
): Promise<JokerUseRow[]> {
  const rows = await prisma.jokerUse.findMany({
    where: { gameDayId },
    include: {
      player: { select: { id: true, name: true, avatarVersion: true } },
    },
  });
  const mapped: JokerUseRow[] = rows.map((r) => ({
    playerId: r.player.id,
    playerName: r.player.name,
    avatarVersion: r.player.avatarVersion,
    ppgAtUse: Number(r.ppgAtUse),
    gamesCredited: r.gamesCredited,
    pointsCredited: Number(r.pointsCredited),
  }));
  mapped.sort((a, b) => a.playerName.localeCompare(b.playerName, "de"));
  return mapped;
}
