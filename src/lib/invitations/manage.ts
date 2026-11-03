import { prisma } from "@/lib/db";
import { InvitationNotFoundError } from "./errors";

export type OpenInvitation = {
  id: string;
  note: string | null;
  expiresAt: Date;
  usedCount: number;
  maxUses: number;
  createdAt: Date;
  uses: { playerId: string; playerName: string; usedAt: Date }[];
};

export async function listOpenInvitations(
  groupId: string,
  now: Date = new Date(),
): Promise<OpenInvitation[]> {
  const rows = await prisma.invitation.findMany({
    where: { groupId, kind: "member", revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    include: {
      uses: {
        orderBy: { usedAt: "asc" },
        include: { player: { select: { name: true } } },
      },
    },
  });
  return rows
    .filter((r) => r.usedCount < r.maxUses)
    .map((r) => ({
      id: r.id,
      note: r.note,
      expiresAt: r.expiresAt,
      usedCount: r.usedCount,
      maxUses: r.maxUses,
      createdAt: r.createdAt,
      uses: r.uses.map((u) => ({
        playerId: u.playerId,
        playerName: u.player.name,
        usedAt: u.usedAt,
      })),
    }));
}

export async function revokeInvitation(i: {
  id: string;
  groupId: string;
  actorId: string;
  now?: Date;
}): Promise<void> {
  const now = i.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const res = await tx.invitation.updateMany({
      where: { id: i.id, groupId: i.groupId, kind: "member", revokedAt: null },
      data: { revokedAt: now },
    });
    if (res.count === 0) throw new InvitationNotFoundError();
    const row = await tx.invitation.findUniqueOrThrow({
      where: { id: i.id },
      select: { note: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: i.actorId,
        groupId: i.groupId,
        action: "invitation.revoke",
        entityType: "Invitation",
        entityId: i.id,
        payload: { note: row.note },
      },
    });
  });
}

export async function listFounderInvitations(now: Date = new Date()): Promise<
  { id: string; note: string | null; expiresAt: Date; usedCount: number; createdAt: Date }[]
> {
  const rows = await prisma.invitation.findMany({
    where: { kind: "founder", revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, note: true, expiresAt: true, usedCount: true, maxUses: true, createdAt: true },
  });
  return rows
    .filter((r) => r.usedCount < r.maxUses)
    .map(({ id, note, expiresAt, usedCount, createdAt }) => ({
      id,
      note,
      expiresAt,
      usedCount,
      createdAt,
    }));
}

export async function revokeFounderInvitation(id: string, now: Date = new Date()): Promise<void> {
  const res = await prisma.invitation.updateMany({
    where: { id, kind: "founder", revokedAt: null },
    data: { revokedAt: now },
  });
  if (res.count === 0) throw new InvitationNotFoundError();
}
