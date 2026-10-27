"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { verifyAuditAction } from "@/app/app/settings/audit/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

const PROBLEMS = {
  gap: "an entry is missing",
  link: "entries were reordered or replaced",
  hash: "an entry's content was changed",
} as const;

export function AuditVerify() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyAuditAction>> | null>(null);
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResult(await verifyAuditAction());
          setBusy(false);
        }}
      >
        <ShieldCheck /> {busy ? "Checking…" : "Verify integrity"}
      </Button>
      {result ? (
        !result.ok ? (
          <Alert tone="danger">{result.error}</Alert>
        ) : result.data.ok ? (
          <Alert tone="success" title="Audit trail intact">
            All {result.data.checked} chained entries match their hashes.
            {result.data.legacy ? ` ${result.data.legacy} older entries predate the chain.` : ""}
          </Alert>
        ) : (
          <Alert tone="danger" title="Audit trail was altered">
            Entry #{result.data.brokenAtSeq} fails verification: {PROBLEMS[result.data.problem]}. Entries
            before it ({result.data.checked}) are intact.
          </Alert>
        )
      ) : null}
    </div>
  );
}
