-- CreateIndex
CREATE INDEX "AttendanceCorrectionRequest_employeeId_idx" ON "AttendanceCorrectionRequest"("employeeId");

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "EmployeeLocation_locationId_idx" ON "EmployeeLocation"("locationId");

-- CreateIndex
CREATE INDEX "Loan_employeeId_idx" ON "Loan"("employeeId");

-- CreateIndex
CREATE INDEX "PayAdjustment_payRunId_idx" ON "PayAdjustment"("payRunId");

-- CreateIndex
CREATE INDEX "PayAdjustment_employeeId_idx" ON "PayAdjustment"("employeeId");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_employeeId_idx" ON "ScheduleChangeRequest"("employeeId");

-- CreateIndex
CREATE INDEX "ScheduleChangeRequest_shiftId_idx" ON "ScheduleChangeRequest"("shiftId");

-- CreateIndex
CREATE INDEX "Shift_locationId_startAt_idx" ON "Shift"("locationId", "startAt");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_shiftId_idx" ON "ShiftSwapRequest"("shiftId");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_targetShiftId_idx" ON "ShiftSwapRequest"("targetShiftId");

-- CreateIndex
CREATE INDEX "TimeEntry_shiftId_idx" ON "TimeEntry"("shiftId");

-- CreateIndex
CREATE INDEX "TimeException_timeEntryId_idx" ON "TimeException"("timeEntryId");

-- CreateIndex
CREATE INDEX "TimeException_shiftId_idx" ON "TimeException"("shiftId");

-- CreateIndex
CREATE INDEX "Shift_recurrenceId_idx" ON "Shift"("recurrenceId");

