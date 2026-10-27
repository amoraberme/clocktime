-- AlterTable
ALTER TABLE "Punch" ADD COLUMN     "clientKey" TEXT,
ADD COLUMN     "clockOffsetMs" INTEGER,
ADD COLUMN     "fixAt" TIMESTAMP(3),
ADD COLUMN     "seq" INTEGER;

-- CreateIndex
CREATE INDEX "Punch_companyId_clientKey_idx" ON "Punch"("companyId", "clientKey");

