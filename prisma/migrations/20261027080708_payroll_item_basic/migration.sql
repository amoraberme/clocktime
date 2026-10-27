-- AlterTable
ALTER TABLE "PayRunItem" ADD COLUMN     "basicCentavos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warnings" JSONB NOT NULL DEFAULT '[]';
