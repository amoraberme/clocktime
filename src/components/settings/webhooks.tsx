"use client";

import { Copy, Send, Trash2, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  createWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
} from "@/app/app/settings/webhooks/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export function CreateWebhookForm({ events }: { events: { key: string; label: string }[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(events.map((e) => e.key));
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {secret ? (
        <Alert tone="success" title="Copy the signing secret now. It won't be shown again.">
          <div className="mt-2 flex items-center gap-2">
            <code
              className="bg-card flex-1 overflow-x-auto rounded px-2 py-1 font-mono text-xs"
              data-testid="webhook-secret"
            >
              {secret}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Copied"))}
            >
              <Copy />
            </Button>
          </div>
        </Alert>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await createWebhookAction({ url, events: picked });
          if (!r.ok) return toast.error(r.error);
          setSecret(r.data);
          setUrl("");
          router.refresh();
        }}
      >
        <Field label="Receiver URL" htmlFor="webhook-url">
          <Input
            id="webhook-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://payroll.example.com/hooks/clocktime"
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((ev) => (
            <label key={ev.key} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={picked.includes(ev.key)}
                onChange={(e) =>
                  setPicked(e.target.checked ? [...picked, ev.key] : picked.filter((x) => x !== ev.key))
                }
              />
              <span>
                <code className="font-mono text-xs">{ev.key}</code>
                <span className="text-muted-foreground block">{ev.label}</span>
              </span>
            </label>
          ))}
        </div>
        <Button>
          <Webhook /> Add webhook
        </Button>
      </form>
    </div>
  );
}

export function WebhookControls({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      if (r.message) toast.success(r.message);
      router.refresh();
    } else toast.error(r.error);
  };
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy || !active}
        onClick={() => act(() => testWebhookAction(id))}
      >
        <Send /> Test
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => act(() => toggleWebhookAction(id, !active))}
      >
        {active ? "Turn off" : "Turn on"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger"
        disabled={busy}
        onClick={() => {
          if (confirm("Delete this webhook? Its delivery history is deleted too."))
            act(() => deleteWebhookAction(id));
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
