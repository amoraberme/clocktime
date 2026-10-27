-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "seq" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_companyId_seq_key" ON "AuditLog"("companyId", "seq");

