"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  importTerminalLogAction,
  linkTerminalUserAction,
  removeTerminalAction,
  saveTerminalAction,
  setTerminalStatusAction,
  syncRosterAction,
} from "@/app/app/settings/devices/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

type Option = { id: string; name: string };

export type TerminalValues = {
  id?: string;
  name: string;
  serialNumber: string;
  locationId: string | null;
  useStatusKeys: boolean;
  allowedIps: string[];
};

export function TerminalForm({
  initial,
  locations,
  onDone,
}: {
  initial: TerminalValues;
  locations: Option[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ips, setIps] = useState(initial.allowedIps.join("\n"));
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await saveTerminalAction(v.id ?? null, {
          ...v,
          allowedIps: ips
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(r.message);
        router.refresh();
        onDone?.();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="t-name">
          <Input
            id="t-name"
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            placeholder="Cebu Depot entrance"
            required
          />
        </Field>
        <Field label="Serial number" htmlFor="t-sn" hint="Menu → System Info → Device Info">
          <Input
            id="t-sn"
            value={v.serialNumber}
            onChange={(e) => setV({ ...v, serialNumber: e.target.value.trim() })}
            required
          />
        </Field>
        <Field label="Branch" htmlFor="t-loc">
          <Select
            id="t-loc"
            value={v.locationId ?? ""}
            onChange={(e) => setV({ ...v, locationId: e.target.value || null })}
          >
            <option value="">Any branch</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Only accept from IPs (optional)"
          htmlFor="t-ips"
          hint="One per line, e.g. the branch's public IP"
        >
          <Textarea id="t-ips" rows={2} value={ips} onChange={(e) => setIps(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={v.useStatusKeys}
          onChange={(e) => setV({ ...v, useStatusKeys: e.target.checked })}
        />
        Staff press IN/OUT keys on this terminal (otherwise taps are read against the schedule)
      </label>
      <Button disabled={busy}>{v.id ? "Save" : "Add terminal"}</Button>
    </form>
  );
}

export function AddTerminal({ locations }: { locations: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add terminal</Button>
      </DialogTrigger>
      <DialogContent title="Add a terminal" className="max-w-2xl">
        <TerminalForm
          locations={locations}
          onDone={() => setOpen(false)}
          initial={{
            name: "",
            serialNumber: "",
            locationId: locations[0]?.id ?? null,
            useStatusKeys: false,
            allowedIps: [],
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function TerminalRowActions({
  terminal,
  locations,
  active,
}: {
  terminal: TerminalValues & { id: string };
  locations: Option[];
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        </DialogTrigger>
        <DialogContent title={`Edit ${terminal.name}`} className="max-w-2xl">
          <TerminalForm initial={terminal} locations={locations} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          const r = await setTerminalStatusAction(terminal.id, !active);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        }}
      >
        {active ? "Disable" : "Enable"}
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Remove ${terminal.name}`}
        onClick={async () => {
          if (!confirm(`Remove ${terminal.name}? It will stop uploading punches.`)) return;
          const r = await removeTerminalAction(terminal.id);
          if (!r.ok) return toast.error(r.error);
          toast.success(r.message);
          router.refresh();
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function SyncRosterButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await syncRosterAction();
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success(
          r.data ? `${r.data} user updates queued for the terminals.` : "Terminals are already up to date.",
        );
        router.refresh();
      }}
    >
      <RefreshCw /> Sync staff to terminals
    </Button>
  );
}

export function LinkTerminalUser({ userId, employees }: { userId: string; employees: Option[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!employeeId) return;
        const r = await linkTerminalUserAction(userId, employeeId);
        if (!r.ok) return toast.error(r.error);
        toast.success(
          `Linked. ${r.data.ingested} punch${r.data.ingested === 1 ? "" : "es"} added to their timesheet.`,
        );
        router.refresh();
      }}
    >
      <Select
        aria-label={`Employee for terminal ID ${userId}`}
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
      >
        <option value="">Choose who this is…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </Select>
      <Button size="sm" disabled={!employeeId}>
        Link
      </Button>
    </form>
  );
}

type ImportSummary = {
  received: number;
  ingested: number;
  duplicates: number;
  alreadyImported: number;
  unmatched: Record<string, number>;
  parseErrors: number;
  firstErrors: { line: number; text: string }[];
  dryRun: boolean;
};

export function LogImport({ terminals }: { terminals: Option[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  async function send(dryRun: boolean) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("deviceId", deviceId);
    fd.set("dryRun", dryRun ? "1" : "0");
    setBusy(true);
    const r = await importTerminalLogAction(fd);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setSummary(r.data);
    if (!dryRun) {
      toast.success(`${r.data.ingested} punches imported.`);
      router.refresh();
    }
  }
  const unmatched = summary ? Object.entries(summary.unmatched) : [];
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Log file"
          htmlFor="imp-file"
          hint="ZKTeco attlog.dat from a USB export, or a CSV with user ID and date/time columns"
        >
          <Input
            id="imp-file"
            type="file"
            accept=".dat,.txt,.csv,text/plain,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSummary(null);
            }}
          />
        </Field>
        <Field label="From terminal (optional)" htmlFor="imp-dev">
          <Select id="imp-dev" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">Not listed</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={!file || busy} onClick={() => send(true)}>
          Preview
        </Button>
        <Button disabled={!file || busy || !summary?.dryRun} onClick={() => send(false)}>
          Import
        </Button>
      </div>
      {summary ? (
        <div data-testid="import-summary">
          <Alert tone={unmatched.length || summary.parseErrors ? "warning" : "success"}>
            {summary.dryRun ? "Preview: " : "Imported: "}
            {summary.received} records · {summary.ingested} new · {summary.duplicates} repeat taps ·{" "}
            {summary.alreadyImported} already imported
            {unmatched.length
              ? ` · ${unmatched.reduce((t, [, n]) => t + n, 0)} with unknown IDs (${unmatched.map(([id]) => id).join(", ")})`
              : ""}
            {summary.parseErrors
              ? ` · ${summary.parseErrors} unreadable lines (e.g. line ${summary.firstErrors[0]?.line})`
              : ""}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
