import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { requireContext } from "@/server/context";

const PAGE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entity?: string }>;
}) {
  const ctx = await requireContext("HR");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.entity ? { entityType: sp.entity } : {};
  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE }),
    ctx.db.auditLog.count({ where }),
  ]);
  const show = (v: unknown) => (v == null ? "" : JSON.stringify(v).slice(0, 220));
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>When</TH>
            <TH>Who</TH>
            <TH>What</TH>
            <TH>Change</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="text-xs whitespace-nowrap">
                {formatDateTime(r.createdAt, ctx.company.timezone)}
              </TD>
              <TD className="text-sm">{r.actorLabel}</TD>
              <TD className="text-sm">
                <span className="font-mono text-xs">{r.action}</span>
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
          {page > 1 ? <Link href={`?page=${page - 1}`}>← Newer</Link> : null}
          {page * PAGE < total ? <Link href={`?page=${page + 1}`}>Older →</Link> : null}
        </span>
      </div>
    </Card>
  );
}
