"use client";

import { FileUp } from "lucide-react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { importScheduleAction } from "@/app/app/schedule/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";

type RowResult = { row: number; ok: boolean; name?: string; summary?: string; error?: string };

const TEMPLATE = `employee_no,date,start,end,branch,break_minutes
0001,2026-11-02,08:00,17:00,MNL,60
0002,2026-11-02,22:00,06:00,CLK,60
0003,2026-11-02,07:00,07:00,CEB,0
0001,2026-11-03,OFF,,,
`;

export function ScheduleImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [publish, setPublish] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setRows([]);
    setResults(null);
    setDone(false);
    setError(null);
  }

  function onFile(file: File) {
    reset();
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        setRows(res.data);
        setBusy(true);
        const r = await importScheduleAction({ rows: res.data, dryRun: true, publish });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setResults(r.data.results);
      },
      error: () => setError("Couldn't read that file. Save it as CSV (UTF-8) and try again."),
    });
  }

  async function confirm() {
    setBusy(true);
    const r = await importScheduleAction({ rows, dryRun: false, publish });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResults(r.data.results);
    if (!r.data.imported) return setError("Fix the rows marked below, then upload the file again.");
    setDone(true);
    toast.success(
      `Imported ${r.data.created} shift${r.data.created === 1 ? "" : "s"}${r.data.cleared ? `, replaced ${r.data.cleared}` : ""}.`,
    );
    router.refresh();
  }

  const bad = results?.filter((r) => !r.ok).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileUp /> Import
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import a schedule from a spreadsheet"
        description="One row per person per day. Each person and date in the file replaces that day's shifts. End before start is an overnight shift, start = end is a 24-hour duty, OFF is a rest day."
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <a
            className="text-primary text-sm underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="clocktime-schedule-template.csv"
          >
            Download the CSV template
          </a>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={publish} disabled={!!results} onChange={(e) => setPublish(e.target.checked)} />
            Publish right away (otherwise shifts are added as drafts)
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Schedule CSV file"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="file:bg-primary file:text-primary-foreground block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2"
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {busy ? <p className="text-muted-foreground text-sm">Checking rows…</p> : null}
          {results ? (
            <>
              <div className="max-h-72 overflow-y-auto rounded-md border text-sm">
                {results.map((r) => (
                  <div
                    key={r.row}
                    className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-0"
                  >
                    <span>
                      Row {r.row}
                      {r.name ? ` · ${r.name}` : ""}
                      {r.summary ? <span className="text-muted-foreground"> · {r.summary}</span> : null}
                    </span>
                    {r.ok ? (
                      <Badge tone="success">{done ? "Imported" : "Ready"}</Badge>
                    ) : (
                      <span className="text-danger text-xs">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
              {done ? (
                <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>
                  Done
                </Button>
              ) : bad ? (
                <p className="text-danger text-sm">
                  {bad} row{bad === 1 ? "" : "s"} need fixing. Nothing is imported until every row is valid.
                </p>
              ) : (
                <Button className="w-full" disabled={busy} onClick={confirm}>
                  Import {results.length} row{results.length === 1 ? "" : "s"}
                  {publish ? " and publish" : " as drafts"}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
