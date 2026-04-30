-- AlterEnum
BEGIN;
CREATE TYPE "GameDayStatus_new" AS ENUM ('planned', 'in_progress', 'finished');
ALTER TABLE "GameDay" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GameDay" ALTER COLUMN "status" TYPE "GameDayStatus_new" USING ("status"::text::"GameDayStatus_new");
ALTER TYPE "GameDayStatus" RENAME TO "GameDayStatus_old";
ALTER TYPE "GameDayStatus_new" RENAME TO "GameDayStatus";
DROP TYPE "GameDayStatus_old";
ALTER TABLE "GameDay" ALTER COLUMN "status" SET DEFAULT 'planned';
COMMIT;
