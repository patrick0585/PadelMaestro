-- letzter Abgleich: Rolle aus isAdmin, Besitzer unangetastet
UPDATE "Membership" m SET "role" = CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole"
FROM "Player" p WHERE p."id" = m."playerId" AND m."role" <> 'owner'
  AND m."role" <> CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole";
ALTER TABLE "Player" DROP COLUMN "isAdmin";
