-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "scoring" JSONB NOT NULL DEFAULT '{"4":{"mode":"set","target":6,"max":7},"5":{"mode":"fixed","games":3},"6":{"mode":"fixed","games":3}}';

-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN     "scoring" JSONB;
