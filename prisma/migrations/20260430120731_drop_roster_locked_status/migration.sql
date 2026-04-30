-- AlterEnum
BEGIN;

-- Hard-fail early with a clear message instead of letting the implicit
-- enum cast below produce a cryptic "invalid input value" panic.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "GameDay" WHERE status::text = 'roster_locked') THEN
    RAISE EXCEPTION 'Migration aborted: GameDay rows still in roster_locked. Resolve them (transition to in_progress or delete) before re-running.';
  END IF;
END $$;

CREATE TYPE "GameDayStatus_new" AS ENUM ('planned', 'in_progress', 'finished');
ALTER TABLE "GameDay" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GameDay" ALTER COLUMN "status" TYPE "GameDayStatus_new" USING ("status"::text::"GameDayStatus_new");
ALTER TYPE "GameDayStatus" RENAME TO "GameDayStatus_old";
ALTER TYPE "GameDayStatus_new" RENAME TO "GameDayStatus";
DROP TYPE "GameDayStatus_old";
ALTER TABLE "GameDay" ALTER COLUMN "status" SET DEFAULT 'planned';
COMMIT;
