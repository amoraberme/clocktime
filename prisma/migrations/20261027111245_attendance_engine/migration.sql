-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExceptionType" ADD VALUE 'LONG_DUTY';
ALTER TYPE "ExceptionType" ADD VALUE 'MISSING_CLOCK_IN';
ALTER TYPE "ExceptionType" ADD VALUE 'LOCKED_PERIOD_PUNCH';
ALTER TYPE "ExceptionType" ADD VALUE 'OFFLINE_TIME_SUSPECT';
ALTER TYPE "ExceptionType" ADD VALUE 'PROXY_SUSPECT';

-- AlterEnum
ALTER TYPE "PunchAction" ADD VALUE 'TOGGLE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PunchSource" ADD VALUE 'BIOMETRIC';
ALTER TYPE "PunchSource" ADD VALUE 'IMPORT';
ALTER TYPE "PunchSource" ADD VALUE 'CORRECTION';

-- AlterTable
ALTER TABLE "Punch" ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "method" TEXT,
ADD COLUMN     "offline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outsideGeofence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "inPunchId" TEXT,
ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outPunchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_inPunchId_key" ON "TimeEntry"("inPunchId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_outPunchId_key" ON "TimeEntry"("outPunchId");

