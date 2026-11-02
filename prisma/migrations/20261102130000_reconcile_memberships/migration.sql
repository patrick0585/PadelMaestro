-- Idempotenter Abgleich: spiegelt Player-Zustand (isAdmin, deletedAt) in Membership und füllt NULL-groupIds.
-- Wird in PR 4 vor NOT NULL erneut verwendet; Zielgruppe ist 'padelmaestro'.

-- 1 fehlende Mitgliedschaften
INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g
WHERE g."slug" = 'padelmaestro'
  AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."playerId" = p."id" AND m."groupId" = g."id");
-- 2 Rolle aus isAdmin, owner unangetastet
UPDATE "Membership" m SET "role" = CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole"
FROM "Player" p WHERE p."id" = m."playerId" AND m."role" <> 'owner'
  AND m."role" <> CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole";
-- 3 removedAt aus deletedAt
UPDATE "Membership" m SET "removedAt" = p."deletedAt"
FROM "Player" p WHERE p."id" = m."playerId" AND m."removedAt" IS DISTINCT FROM p."deletedAt";
-- 4 NULL-Gruppen füllen
UPDATE "Season"   SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay"  SET "groupId" = s."groupId" FROM "Season" s WHERE "GameDay"."seasonId" = s."id" AND "GameDay"."groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
