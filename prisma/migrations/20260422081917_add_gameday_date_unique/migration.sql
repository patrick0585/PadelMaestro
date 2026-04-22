/*
  Warnings:

  - A unique constraint covering the columns `[seasonId,date]` on the table `GameDay` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex (may not exist if DB was reset after initial migration drift)
DROP INDEX IF EXISTS "GameDay_seasonId_date_idx";

-- CreateIndex
CREATE UNIQUE INDEX "GameDay_seasonId_date_key" ON "GameDay"("seasonId", "date");
