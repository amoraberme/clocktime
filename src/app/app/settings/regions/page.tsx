import Link from "next/link";
import { RegionForm, RegionRow } from "@/components/settings/region-form";
import { UpgradeCard } from "@/components/upgrade-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireContext } from "@/server/context";

export default async function RegionsPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("regions"))
    return (
      <UpgradeCard
        feature="regions"
        title="Group branches into regions"
        description="Nationwide dashboards and reports by region, with HR and timekeeper roles."
      />
    );
  const regions = await ctx.db.region.findMany({
    orderBy: { name: "asc" },
    include: { locations: { where: { archivedAt: null }, select: { id: true, name: true, code: true } } },
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a region</CardTitle>
          <CardDescription>
            Group branches (e.g. NCR, Visayas) for nationwide dashboards and reports. Assign each branch to a
            region on the{" "}
            <Link href="/app/locations" className="text-primary">
              Locations
            </Link>{" "}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegionForm />
        </CardContent>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Region</TH>
              <TH>Code</TH>
              <TH>Branches</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {regions.length === 0 ? (
              <TR>
                <TD colSpan={4} className="text-muted-foreground text-center">
                  No regions yet.
                </TD>
              </TR>
            ) : (
              regions.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD>{r.code ?? "—"}</TD>
                  <TD className="text-sm">
                    {r.locations.length === 0
                      ? "—"
                      : r.locations.map((l) => (l.code ? `${l.name} (${l.code})` : l.name)).join(", ")}
                  </TD>
                  <TD className="text-right">
                    <RegionRow id={r.id} name={r.name} code={r.code ?? ""} />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
