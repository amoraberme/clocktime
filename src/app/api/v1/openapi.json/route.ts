import { NextResponse } from "next/server";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const list = (item: string) => ({
  type: "object",
  properties: { data: { type: "array", items: ref(item) }, nextCursor: { type: "string", nullable: true } },
});
const paging = [
  { name: "from", in: "query", schema: { type: "string", format: "date" } },
  { name: "to", in: "query", schema: { type: "string", format: "date" } },
  { name: "employeeId", in: "query", schema: { type: "string" } },
  { name: "limit", in: "query", schema: { type: "integer", maximum: 500, default: 100 } },
  { name: "cursor", in: "query", schema: { type: "string" } },
];

export function GET(req: Request) {
  const server = new URL(req.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "ClockTime API",
      version: "1.0.0",
      description:
        "Read time, schedule and payroll data and record punches. Requires a Pro plan API key (Settings → API).",
    },
    servers: [{ url: `${server}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "API key, e.g. ct_ab12cd_…" },
      },
      schemas: {
        Employee: {
          type: "object",
          properties: {
            id: { type: "string" },
            employeeNo: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            role: { type: "string" },
            status: { type: "string" },
            position: { type: "string" },
            department: { type: "string" },
            payType: { type: "string", enum: ["HOURLY", "DAILY", "MONTHLY"] },
            hireDate: { type: "string", format: "date" },
          },
        },
        TimeEntry: {
          type: "object",
          properties: {
            id: { type: "string" },
            employeeId: { type: "string" },
            clockInAt: { type: "string", format: "date-time" },
            clockOutAt: { type: "string", format: "date-time", nullable: true },
            breaks: { type: "array", items: { type: "object" } },
            source: { type: "string" },
            status: { type: "string" },
            gps: { type: "object", nullable: true },
            outsideGeofence: { type: "boolean" },
          },
        },
        Shift: {
          type: "object",
          properties: {
            id: { type: "string" },
            employeeId: { type: "string", nullable: true },
            startAt: { type: "string", format: "date-time" },
            endAt: { type: "string", format: "date-time" },
            breakMinutes: { type: "integer" },
            confirmed: { type: "boolean" },
          },
        },
        PunchRequest: {
          type: "object",
          required: ["action"],
          properties: {
            employeeId: { type: "string" },
            employeeNo: { type: "string" },
            action: { type: "string", enum: ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"] },
            at: { type: "string", format: "date-time" },
            clientId: { type: "string", format: "uuid", description: "Makes retries idempotent" },
            locationId: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/employees": {
        get: {
          summary: "List employees",
          parameters: paging.slice(3),
          responses: {
            200: { description: "OK", content: { "application/json": { schema: list("Employee") } } },
          },
        },
      },
      "/time-entries": {
        get: {
          summary: "List time entries (default: last 14 days)",
          parameters: paging,
          responses: {
            200: { description: "OK", content: { "application/json": { schema: list("TimeEntry") } } },
          },
        },
      },
      "/shifts": {
        get: {
          summary: "List published shifts (default: next 14 days)",
          parameters: paging,
          responses: {
            200: { description: "OK", content: { "application/json": { schema: list("Shift") } } },
          },
        },
      },
      "/timesheets": {
        get: {
          summary: "Hours and gross estimate per employee for a pay period",
          parameters: [{ name: "start", in: "query", schema: { type: "string", format: "date" } }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/attendance": {
        get: {
          summary:
            "Cutoff attendance: daily DTR rows (time in/out, hours, late, undertime, OT rendered/approved, leave, absences) and per-employee and per-branch totals",
          parameters: [
            { name: "start", in: "query", schema: { type: "string", format: "date" } },
            { name: "department", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "region", in: "query", schema: { type: "string" } },
            { name: "employee", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
      "/pay-runs": { get: { summary: "List pay runs", responses: { 200: { description: "OK" } } } },
      "/pay-runs/{id}": {
        get: {
          summary: "Finalized pay run with per-employee contributions and tax",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "OK" }, 409: { description: "Not finalized" } },
        },
      },
      "/attendance-logs": {
        post: {
          summary:
            "Batch upload terminal/bridge attendance logs (scope: punch). Body: { serialNumber?, records: [{ userId, at, action?, method? }] }, up to 1000; idempotent",
          responses: {
            200: { description: "Ingested, with counts of new, duplicate and unmatched records" },
          },
        },
      },
      "/punches": {
        post: {
          summary: "Record a punch (scope: punch)",
          requestBody: { content: { "application/json": { schema: ref("PunchRequest") } } },
          responses: {
            200: { description: "Recorded" },
            422: { description: "Rejected (e.g. already clocked in)" },
          },
        },
      },
    },
  });
}
