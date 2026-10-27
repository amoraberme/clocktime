import Link from "next/link";
import { AddHolidayForm, DeleteHolidayButton } from "@/components/settings/holiday-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { dateKey, formatKey, utcDateToKey } from "@/lib/time";
import { requireContext } from "@/server/context";
import { prisma } from "@/server/db";

const TYPE = {
  REGULAR: { label: "Regular", tone: "danger" },
  SPECIAL_NON_WORKING: { label: "Special non-working", tone: "warning" },
  SPECIAL_WORKING: { label: "Special working", tone: "neutral" },
} as const;

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requireContext("HR");
  const { year: y } = await searchParams;
  const year = Number(y) || Number(dateKey(new Date(), ctx.company.timezone).slice(0, 4));
  const holidays = await prisma.holiday.findMany({
    where: {
      OR: [{ companyId: null }, { companyId: ctx.company.id }],
      date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) },
    },
    orderBy: { date: "asc" },
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a local holiday</CardTitle>
          <CardDescription>
            City or provincial holidays, or company days off. National holidays are maintained by ClockTime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddHolidayForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{year} holidays</CardTitle>
          <div className="flex gap-2 text-sm">
            <Link className="text-primary" href={`?year=${year - 1}`}>
              ← {year - 1}
            </Link>
            <Link className="text-primary" href={`?year=${year + 1}`}>
              {year + 1} →
            </Link>
          </div>
        </CardHeader>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Holiday</TH>
              <TH>Type</TH>
              <TH>Source</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {holidays.map((h) => (
              <TR key={h.id}>
                <TD className="whitespace-nowrap">
                  {formatKey(utcDateToKey(h.date), { weekday: "short", month: "short", day: "numeric" })}
                </TD>
                <TD>{h.name}</TD>
                <TD>
                  <Badge tone={TYPE[h.type].tone}>{TYPE[h.type].label}</Badge>
                </TD>
                <TD className="text-muted-foreground">{h.companyId ? "Your company" : "National"}</TD>
                <TD>{h.companyId ? <DeleteHolidayButton id={h.id} /> : null}</TD>
              </TR>
            ))}
            {holidays.length === 0 ? (
              <TR>
                <TD colSpan={5} className="text-muted-foreground text-center">
                  No holidays loaded for {year} yet.
                </TD>
              </TR>
            ) : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
