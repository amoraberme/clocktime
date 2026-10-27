"use client";

import { FileUp } from "lucide-react";
import Papa from "papaparse";
import { useState } from "react";
import { toast } from "sonner";
import { importEmployeesAction } from "@/app/app/team/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/misc";
import { CSV_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/validation/employee";

type RowResult = { row: number; ok: boolean; name?: string; error?: string };

const TEMPLATE = `${CSV_COLUMNS.join(",")}\nJuan,Dela Cruz,juan@example.com,09171234567,,EMPLOYEE,DAILY,695,2025-01-15,Operations,Barista\n`;

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [results, setResults] = useState<RowResult[] | null>(null);
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
        if (res.data.length > MAX_IMPORT_ROWS)
          return setError(`The file has ${res.data.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time.`);
        setRows(res.data);
        setBusy(true);
        const r = await importEmployeesAction({ rows: res.data, dryRun: true });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setResults(r.data);
      },
      error: () => setError("Couldn't read that file. Save it as CSV (UTF-8) and try again."),
    });
  }

  async function confirm() {
    setBusy(true);
    const r = await importEmployeesAction({ rows, dryRun: false });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResults(r.data);
    setDone(true);
    toast.success(`Imported ${r.data.filter((x) => x.ok).length} people.`);
  }

  const okCount = results?.filter((r) => r.ok).length ?? 0;

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
          <FileUp /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Import your team from a spreadsheet"
        description={`Up to ${MAX_IMPORT_ROWS} rows. People with an email get an invite.`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <a
            className="text-primary text-sm underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="clocktime-team-template.csv"
          >
            Download the CSV template
          </a>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
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
                    </span>
                    {r.ok ? (
                      <Badge tone="success">{done ? "Imported" : "Ready"}</Badge>
                    ) : (
                      <span className="text-danger text-xs">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
              {!done ? (
                <Button className="w-full" disabled={busy || okCount === 0} onClick={confirm}>
                  Import {okCount} {okCount === 1 ? "person" : "people"}
                </Button>
              ) : (
                <Button className="w-full" variant="outline" onClick={() => setOpen(false)}>
                  Done
                </Button>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
