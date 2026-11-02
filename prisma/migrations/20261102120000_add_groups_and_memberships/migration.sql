-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Membership_playerId_idx" ON "Membership"("playerId");

-- CreateIndex
CREATE INDEX "Membership_groupId_removedAt_idx" ON "Membership"("groupId", "removedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_groupId_playerId_key" ON "Membership"("groupId", "playerId");

-- CreateIndex
CREATE INDEX "GameDay_groupId_status_idx" ON "GameDay"("groupId", "status");

-- CreateIndex
CREATE INDEX "Season_groupId_isActive_idx" ON "Season"("groupId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Season_groupId_name_key" ON "Season"("groupId", "name");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameDay" ADD CONSTRAINT "GameDay_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: bestehende Daten in die Gruppe "Padelmaestro"
INSERT INTO "Group" ("id","name","slug","createdAt","updatedAt")
VALUES (gen_random_uuid(), 'Padelmaestro', 'padelmaestro', now(), now());

INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g WHERE g."slug" = 'padelmaestro';

UPDATE "Season"  SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
