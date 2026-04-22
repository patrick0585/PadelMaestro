-- DropForeignKey
ALTER TABLE "JokerUse" DROP CONSTRAINT "JokerUse_gameDayId_fkey";

-- AddForeignKey
ALTER TABLE "JokerUse" ADD CONSTRAINT "JokerUse_gameDayId_fkey" FOREIGN KEY ("gameDayId") REFERENCES "GameDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
