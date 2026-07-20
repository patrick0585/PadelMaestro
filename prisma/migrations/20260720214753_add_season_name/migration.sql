-- Add Season.name with backfill (existing rows get "Saison <year>"),
-- then swap the unique constraint from year to name.
ALTER TABLE "Season" ADD COLUMN "name" TEXT;
UPDATE "Season" SET "name" = 'Saison ' || "year";
ALTER TABLE "Season" ALTER COLUMN "name" SET NOT NULL;
DROP INDEX "Season_year_key";
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");
