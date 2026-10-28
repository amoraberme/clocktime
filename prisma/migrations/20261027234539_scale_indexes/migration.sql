-- CreateTable
CREATE TABLE "authRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "authRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "authRateLimit_key_key" ON "authRateLimit"("key");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_startDate_idx" ON "LeaveRequest"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "Punch_companyId_at_idx" ON "Punch"("companyId", "at");

-- CreateIndex
CREATE INDEX "TimeEntry_companyId_clockOutAt_idx" ON "TimeEntry"("companyId", "clockOutAt");

-- CreateIndex
CREATE INDEX "TimeException_employeeId_status_idx" ON "TimeException"("employeeId", "status");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

