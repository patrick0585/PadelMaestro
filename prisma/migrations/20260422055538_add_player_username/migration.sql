-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");
