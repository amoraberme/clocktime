-- CreateEnum
CREATE TYPE "PunchAction" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateTable
CREATE TABLE "Punch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "action" "PunchAction" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "source" "PunchSource" NOT NULL,
    "locationId" TEXT,
    "deviceId" TEXT,
    "ip" TEXT,
    "photoKey" TEXT,
    "timeEntryId" TEXT,
    "accepted" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "Punch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Punch_employeeId_at_idx" ON "Punch"("employeeId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Punch_companyId_clientId_key" ON "Punch"("companyId", "clientId");

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
