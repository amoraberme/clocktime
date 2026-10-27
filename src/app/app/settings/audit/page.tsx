import { Download } from "lucide-react";
import Link from "next/link";
import { AuditVerify } from "@/components/settings/audit-verify";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { requireContext } from "@/server/context";
import { auditFiltersFrom, auditWhere } from "@/server/queries/audit";

const PAGE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireContext("HR");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = auditFiltersFrom(sp);
  const where = auditWhere(filters, ctx.company.timezone);
  const [rows, total, entities] = await Promise.all([
    ctx.db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    ctx.db.auditLog.count({ where }),
    ctx.db.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);
  const qs = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  const pageHref = (p: number) => `?${qs ? `${qs}&` : ""}page=${p}`;
  const show = (v: unknown) => (v == null ? "" : JSON.stringify(v).slice(0, 220));
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <form className="flex flex-wrap items-end gap-2" method="get">
            <Input
              name="actor"
              defaultValue={filters.actor}
              placeholder="Who"
              className="w-40"
              aria-label="Who"
            />
            <Select
              name="entity"
              defaultValue={filters.entity ?? ""}
              className="w-48"
              aria-label="Record type"
            >
              <option value="">All records</option>
              {entities.map((e) => (
                <option key={e.entityType} value={e.entityType}>
                  {e.entityType}
                </option>
              ))}
            </Select>
            <Input
              name="action"
              defaultValue={filters.action}
              placeholder="Action, e.g. leave."
              className="w-44"
              aria-label="Action"
            />
            <Input type="date" name="from" defaultValue={filters.from} className="w-40" aria-label="From" />
            <Input type="date" name="to" defaultValue={filters.to} className="w-40" aria-label="To" />
            <Button variant="outline">Filter</Button>
            {qs ? (
              <Button asChild variant="ghost">
                <Link href="?">Clear</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="ml-auto">
              <a href={`/api/export/audit${qs ? `?${qs}` : ""}`}>
                <Download /> CSV
              </a>
            </Button>
          </form>
          <AuditVerify />
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>#</TH>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>What</TH>
              <TH>Change</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="text-muted-foreground font-mono text-xs">{r.seq ?? ""}</TD>
                <TD className="text-xs whitespace-nowrap">
                  {formatDateTime(r.createdAt, ctx.company.timezone)}
                </TD>
                <TD className="text-sm">{r.actorLabel}</TD>
                <TD className="text-sm">
                  <span className="font-mono text-xs">{r.action}</span>
                  <span className="text-muted-foreground block text-xs">{r.entityType}</span>
                  {r.reason ? (
                    <span className="text-muted-foreground block text-xs">Reason: {r.reason}</span>
                  ) : null}
                </TD>
                <TD className="text-muted-foreground max-w-md text-xs break-all">
                  {r.before ? <span className="block">− {show(r.before)}</span> : null}
                  {r.after ? <span className="block">+ {show(r.after)}</span> : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex justify-between border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">{total} entries</span>
          <span className="flex gap-4">
            {page > 1 ? <Link href={pageHref(page - 1)}>← Newer</Link> : null}
            {page * PAGE < total ? <Link href={pageHref(page + 1)}>Older →</Link> : null}
          </span>
        </div>
      </Card>
    </div>
  );
}
