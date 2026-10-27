import { apiRoute, listQuery, query } from "@/server/api-auth";

export const GET = apiRoute("read", async (ctx, req) => {
  const q = listQuery.parse(query(req));
  const rows = await ctx.db.employee.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: { position: true, department: true },
    orderBy: { id: "asc" },
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, q.limit);
  return {
    data: page.map((e) => ({
      id: e.id,
      employeeNo: e.employeeNo,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      role: e.role,
      status: e.status,
      position: e.position?.name ?? null,
      department: e.department?.name ?? null,
      payType: e.payType,
      hireDate: e.hireDate?.toISOString().slice(0, 10) ?? null,
    })),
    nextCursor: rows.length > q.limit ? page.at(-1)!.id : null,
  };
});
