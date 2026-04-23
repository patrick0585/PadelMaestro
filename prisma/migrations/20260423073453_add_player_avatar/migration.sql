-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "avatarData" BYTEA,
ADD COLUMN     "avatarMimeType" TEXT,
ADD COLUMN     "avatarVersion" INTEGER NOT NULL DEFAULT 0;
