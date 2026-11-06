-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "appleSub" TEXT,
ADD COLUMN     "appleRefreshToken" TEXT,
ADD COLUMN     "appleClientId" TEXT,
ADD COLUMN     "needsName" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Player_appleSub_key" ON "Player"("appleSub");
