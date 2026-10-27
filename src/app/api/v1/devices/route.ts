import { apiRoute } from "@/server/api-auth";
import { isOnline } from "@/server/services/terminals";

/** Attendance terminals and their health. */
export const GET = apiRoute("read", async (api) => {
  const rows = await api.db.attendanceDevice.findMany({
    include: { location: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
  return {
    data: rows.map((d) => ({
      id: d.id,
      name: d.name,
      serialNumber: d.serialNumber,
      branch: d.location?.name ?? null,
      branchCode: d.location?.code ?? null,
      status: d.status,
      online: isOnline(d),
      lastSeenAt: d.lastSeenAt,
    })),
  };
});
