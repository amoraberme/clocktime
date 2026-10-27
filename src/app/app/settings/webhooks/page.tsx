import { CreateWebhookForm, WebhookControls } from "@/components/settings/webhooks";
import { UpgradeCard } from "@/components/upgrade-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { requireContext } from "@/server/context";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from "@/server/services/webhooks";

const STATUS_TONE = { DELIVERED: "success", PENDING: "warning", FAILED: "danger" } as const;

export default async function WebhooksSettingsPage() {
  const ctx = await requireContext("ADMIN");
  if (!ctx.can("webhooks"))
    return (
      <UpgradeCard
        feature="webhooks"
        title="Push attendance to your systems as it happens"
        description="Signed webhooks for punches, approvals, payroll and employee changes."
      />
    );
  const tz = ctx.company.timezone;
  const endpoints = await ctx.db.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" } });
  const deliveries = endpoints.length
    ? await ctx.db.webhookDelivery.findMany({
        where: { endpointId: { in: endpoints.map((e) => e.id) } },
        include: { endpoint: { select: { url: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            We POST JSON to your URL when something happens. Each request carries{" "}
            <code className="font-mono">X-ClockTime-Signature: t=…,v1=…</code>, an HMAC-SHA256 of{" "}
            <code className="font-mono">{"<t>.<body>"}</code> with your signing secret. Failed deliveries are
            retried for about a day.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CreateWebhookForm
            events={WEBHOOK_EVENTS.map((key) => ({ key, label: WEBHOOK_EVENT_LABELS[key] }))}
          />
          {endpoints.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>URL</TH>
                  <TH>Events</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {endpoints.map((e) => (
                  <TR key={e.id}>
                    <TD className="max-w-xs truncate font-mono text-xs">{e.url}</TD>
                    <TD>
                      {e.events.map((ev) => (
                        <Badge key={ev} className="mr-1 mb-1">
                          {ev}
                        </Badge>
                      ))}
                    </TD>
                    <TD>{e.active ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</TD>
                    <TD>
                      <WebhookControls id={e.id} active={e.active} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
      {deliveries.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Event</TH>
                  <TH>URL</TH>
                  <TH>Result</TH>
                </tr>
              </THead>
              <TBody>
                {deliveries.map((d) => (
                  <TR key={d.id}>
                    <TD className="text-sm whitespace-nowrap">{formatDateTime(d.createdAt, tz)}</TD>
                    <TD className="font-mono text-xs">{d.event}</TD>
                    <TD className="max-w-48 truncate font-mono text-xs">{d.endpoint.url}</TD>
                    <TD className="text-sm">
                      <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                        {d.status}
                      </Badge>{" "}
                      <span className="text-muted-foreground">
                        {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
                        {d.lastError ? ` · ${d.lastError}` : ""}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
