import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { ApprovalList } from "@/components/approvals/approval-list";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/time";
import { fullName } from "@/lib/utils";
import { requireContext } from "@/server/context";
import {
  approvalInbox,
  INBOX_LABELS,
  INBOX_LIMIT,
  inboxTotals,
  type InboxType,
} from "@/server/queries/approvals";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; location?: string; department?: string }>;
}) {
  const ctx = await requireContext("MANAGER");
  if (!ctx.can("approvals"))
    return (
      <>
        <PageHeader title="Approvals" />
        <UpgradeCard
          feature="approvals"
          title="One inbox for every request"
          description="Leave, overtime, schedule changes and attendance corrections, approved online with a full audit trail."
        />
      </>
    );
  const sp = await searchParams;
  const filters = { type: sp.type, locationId: sp.location, departmentId: sp.department };
  const [items, totals, locations, departments, steps] = await Promise.all([
    approvalInbox(ctx, filters),
    inboxTotals(ctx, filters),
    ctx.db.location.findMany({
      where: { archivedAt: null, ...(ctx.managedLocationIds ? { id: { in: ctx.managedLocationIds } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ctx.db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.approvalStep.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const deciders = await ctx.db.employee.findMany({
    where: { id: { in: steps.map((s) => s.decidedById) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const decider = new Map(deciders.map((d) => [d.id, fullName(d)]));
  const waiting = totals.waiting;

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          waiting
            ? `${waiting} request${waiting === 1 ? "" : "s"} waiting for you`
            : "Leave, overtime, schedule changes and attendance corrections"
        }
      />
      <form className="mb-4 grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="Type" htmlFor="a-type">
          <Select id="a-type" name="type" defaultValue={sp.type ?? ""}>
            <option value="">All requests</option>
            {(Object.keys(INBOX_LABELS) as InboxType[]).map((t) => (
              <option key={t} value={t}>
                {INBOX_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Branch" htmlFor="a-loc">
          <Select id="a-loc" name="location" defaultValue={sp.location ?? ""}>
            <option value="">All branches</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" htmlFor="a-dept">
          <Select id="a-dept" name="department" defaultValue={sp.department ?? ""}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title="All caught up" description="No requests are waiting." />
      ) : (
        <>
          {totals.total > items.length ? (
            <p className="text-muted-foreground mb-3 text-sm">
              Showing the oldest {INBOX_LIMIT} of {totals.total.toLocaleString()} pending requests. Narrow it
              down by type, branch or department, or decide these first.
            </p>
          ) : null}
          <ApprovalList items={items} />
        </>
      )}
      {steps.length ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {steps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={s.approved ? "success" : "danger"}>
                    {s.approved ? "approved" : "declined"}
                  </Badge>
                  <span>{INBOX_LABELS[s.requestType as InboxType] ?? s.requestType}</span>
                  <span className="text-muted-foreground">
                    level {s.level} · {decider.get(s.decidedById) ?? "someone"} ·{" "}
                    {formatDateTime(s.createdAt, ctx.company.timezone)}
                    {s.note ? ` · “${s.note}”` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
