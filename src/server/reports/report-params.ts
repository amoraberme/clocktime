import "server-only";
import type { ReportFilters } from "../services/attendance-report";

/** Report filters from a query string (?department=&location=&region=&employee=). */
export function filtersFromParams(p: URLSearchParams | Record<string, string | undefined>): ReportFilters {
  const get = (k: string) => (p instanceof URLSearchParams ? p.get(k) : p[k]) || null;
  return {
    employeeId: get("employee"),
    departmentId: get("department"),
    locationId: get("location"),
    regionId: get("region"),
    includeArchived: get("archived") === "1",
  };
}
