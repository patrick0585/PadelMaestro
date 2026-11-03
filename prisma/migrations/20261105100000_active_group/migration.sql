-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "activeGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Player_activeGroupId_idx" ON "Player"("activeGroupId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_activeGroupId_fkey" FOREIGN KEY ("activeGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
