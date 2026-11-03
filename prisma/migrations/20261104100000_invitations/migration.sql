-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('founder', 'member');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "groupId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationUse" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "foundedGroupId" TEXT,

    CONSTRAINT "InvitationUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_groupId_revokedAt_idx" ON "Invitation"("groupId", "revokedAt");

-- CreateIndex
CREATE INDEX "InvitationUse_playerId_idx" ON "InvitationUse"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationUse_invitationId_playerId_key" ON "InvitationUse"("invitationId", "playerId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationUse" ADD CONSTRAINT "InvitationUse_foundedGroupId_fkey" FOREIGN KEY ("foundedGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
