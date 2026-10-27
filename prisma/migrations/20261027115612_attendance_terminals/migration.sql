-- CreateEnum
CREATE TYPE "TerminalStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "AttendanceDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT 'ZKTECO_ADMS',
    "status" "TerminalStatus" NOT NULL DEFAULT 'ACTIVE',
    "useStatusKeys" BOOLEAN NOT NULL DEFAULT false,
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSeenAt" TIMESTAMP(3),
    "lastIp" TEXT,
    "firmware" TEXT,
    "pushVersion" TEXT,
    "attlogStamp" TEXT,
    "operlogStamp" TEXT,
    "offlineNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" SERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "returnCode" INTEGER,
    "sentAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "at" TIMESTAMP(3),
    "raw" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnclaimedTerminal" (
    "serialNumber" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" TEXT,
    "pushVersion" TEXT,

    CONSTRAINT "UnclaimedTerminal_pkey" PRIMARY KEY ("serialNumber")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDevice_serialNumber_key" ON "AttendanceDevice"("serialNumber");

-- CreateIndex
CREATE INDEX "AttendanceDevice_companyId_idx" ON "AttendanceDevice"("companyId");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceLog_companyId_status_idx" ON "DeviceLog"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLog_deviceId_kind_userId_at_key" ON "DeviceLog"("deviceId", "kind", "userId", "at");

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDevice" ADD CONSTRAINT "AttendanceDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLog" ADD CONSTRAINT "DeviceLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLog" ADD CONSTRAINT "DeviceLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

