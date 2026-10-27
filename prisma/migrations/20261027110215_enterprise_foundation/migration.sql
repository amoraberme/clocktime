-- AlterEnum
ALTER TYPE "Plan" ADD VALUE 'ENTERPRISE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'HR';
ALTER TYPE "Role" ADD VALUE 'TIMEKEEPER';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "biometricConsentAt" TIMESTAMP(3),
ADD COLUMN     "cardEnc" TEXT,
ADD COLUMN     "cardLookup" TEXT,
ADD COLUMN     "deviceUserId" TEXT,
ADD COLUMN     "fieldWork" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationConsentAt" TIMESTAMP(3),
ADD COLUMN     "roaming" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "code" TEXT,
ADD COLUMN     "regionId" TEXT;

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDepartment" (
    "employeeId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "EmployeeDepartment_pkey" PRIMARY KEY ("employeeId","departmentId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_companyId_name_key" ON "Region"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_deviceUserId_key" ON "Employee"("companyId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_cardLookup_key" ON "Employee"("companyId", "cardLookup");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_code_key" ON "Location"("companyId", "code");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDepartment" ADD CONSTRAINT "EmployeeDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

