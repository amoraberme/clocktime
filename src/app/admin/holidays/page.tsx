import Link from "next/link";
import { DeleteNationalHoliday, HolidayAdmin } from "@/components/admin/admin-forms";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/server/db";

export default async function NationalHolidaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: y } = await searchParams;
  const year = Number(y) || new Date().getUTCFullYear();
  const holidays = await prisma.holiday.findMany({
    where: {
      companyId: null,
      date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) },
    },
    orderBy: { date: "asc" },
  });
  return (
    <>
      <PageHeader
        title={`National holidays ${year}`}
        description={
          <span className="flex gap-3">
            <Link href={`?year=${year - 1}`}>← {year - 1}</Link>
            <Link href={`?year=${year + 1}`}>{year + 1} →</Link>
          </span>
        }
      />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <HolidayAdmin year={year} />
          <p className="text-muted-foreground mt-3 text-xs">
            Add movable holidays (Holy Week, Eid&apos;l Fitr, Eid&apos;l Adha, Chinese New Year) from the
            official proclamation each year.
          </p>
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {holidays.map((h) => (
              <TR key={h.id}>
                <TD>{h.date.toISOString().slice(0, 10)}</TD>
                <TD>{h.name}</TD>
                <TD>{h.type}</TD>
                <TD className="text-right">
                  <DeleteNationalHoliday id={h.id} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
