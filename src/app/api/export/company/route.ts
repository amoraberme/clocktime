import { getContextOrThrow } from "@/server/context";
import { decrypt } from "@/server/crypto";
import { prisma } from "@/server/db";

/** Full JSON export of a company's data (Data Privacy Act portability). Owners and admins only. */
export async function GET() {
  let ctx;
  try {
    ctx = await getContextOrThrow("ADMIN");
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const id = ctx.company.id;
  const where = { companyId: id };
  const [
    company,
    locations,
    employees,
    timeEntries,
    shifts,
    leaveRequests,
    overtimeRequests,
    holidays,
    payRuns,
    payRunItems,
    adjustments,
    loans,
    auditLogs,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id } }),
    prisma.location.findMany({ where }),
    prisma.employee.findMany({ where, include: { department: true, position: true, locations: true } }),
    prisma.timeEntry.findMany({ where, include: { breaks: true } }),
    prisma.shift.findMany({ where }),
    prisma.leaveRequest.findMany({ where }),
    prisma.overtimeRequest.findMany({ where }),
    prisma.holiday.findMany({ where }),
    prisma.payRun.findMany({ where }),
    prisma.payRunItem.findMany({ where }),
    prisma.payAdjustment.findMany({ where }),
    prisma.loan.findMany({ where }),
    prisma.auditLog.findMany({ where }),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    company,
    locations,
    employees: employees.map(
      ({
        pinHash: _p,
        pinLookup: _l,
        qrToken: _q,
        tinEnc,
        sssEnc,
        philhealthEnc,
        pagibigEnc,
        bankAccountEnc,
        ...e
      }) => ({
        ...e,
        tin: decrypt(tinEnc),
        sss: decrypt(sssEnc),
        philhealth: decrypt(philhealthEnc),
        pagibig: decrypt(pagibigEnc),
        bankAccount: decrypt(bankAccountEnc),
      }),
    ),
    timeEntries,
    shifts,
    leaveRequests,
    overtimeRequests,
    holidays,
    payRuns,
    payRunItems,
    adjustments,
    loans,
    auditLogs,
  };
  await prisma.auditLog.create({
    data: {
      companyId: id,
      actorUserId: ctx.user.id,
      actorLabel: ctx.user.email,
      action: "company.export",
      entityType: "Company",
      entityId: id,
    },
  });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${ctx.company.slug}-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
