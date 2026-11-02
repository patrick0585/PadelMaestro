-- Abgleich (idempotent): fehlende Mitgliedschaften, NULL-Gruppen
INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g
WHERE g."slug" = 'padelmaestro'
  AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."playerId" = p."id" AND m."groupId" = g."id");
UPDATE "Season"  SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay" SET "groupId" = s."groupId" FROM "Season" s WHERE "GameDay"."seasonId" = s."id" AND "GameDay"."groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
-- Pflichtfelder und Fremdschlüssel
ALTER TABLE "Season"  ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "GameDay" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "Season"  DROP CONSTRAINT "Season_groupId_fkey";
ALTER TABLE "Season"  ADD CONSTRAINT "Season_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameDay" DROP CONSTRAINT "GameDay_groupId_fkey";
ALTER TABLE "GameDay" ADD CONSTRAINT "GameDay_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Saisonname nur noch pro Gruppe eindeutig
DROP INDEX "Season_name_key";
