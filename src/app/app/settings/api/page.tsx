import { CreateKeyForm, RevokeKey } from "@/components/settings/api-keys";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { requireContext } from "@/server/context";

export default async function ApiSettingsPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("api"))
    return (
      <UpgradeCard
        feature="api"
        title="Connect ClockTime to your other tools"
        description="Read hours, schedules and payroll, or send punches from biometric terminals, with a REST API."
      />
    );
  const keys = await ctx.db.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" } });
  const base = `${process.env.APP_URL ?? "http://localhost:3000"}/api/v1`;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Base URL <code className="font-mono">{base}</code> ·{" "}
            <a className="text-primary underline" href="/api/v1/openapi.json" target="_blank">
              OpenAPI spec
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CreateKeyForm />
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Key</TH>
                <TH>Scopes</TH>
                <TH>Last used</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {keys.map((k) => (
                <TR key={k.id}>
                  <TD className="font-medium">{k.name}</TD>
                  <TD className="font-mono text-xs">ct_{k.prefix}_••••</TD>
                  <TD>
                    {k.scopes.map((s) => (
                      <Badge key={s} className="mr-1">
                        {s}
                      </Badge>
                    ))}
                  </TD>
                  <TD className="text-muted-foreground text-sm">
                    {k.lastUsedAt ? formatDateTime(k.lastUsedAt, ctx.company.timezone) : "never"}
                  </TD>
                  <TD className="text-right">
                    <RevokeKey id={k.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted overflow-x-auto rounded-md p-4 text-xs">{`curl ${base}/time-entries?from=2026-10-01 \\
  -H "Authorization: Bearer ct_xxxxxx_…"

curl -X POST ${base}/punches \\
  -H "Authorization: Bearer ct_xxxxxx_…" -H "Content-Type: application/json" \\
  -d '{"employeeNo":"0003","action":"CLOCK_IN","clientId":"<uuid>"}'`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
