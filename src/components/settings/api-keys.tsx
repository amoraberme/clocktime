"use client";

import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createKeyAction, revokeKeyAction } from "@/app/app/settings/api/actions";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";

export function CreateKeyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [created, setCreated] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {created ? (
        <Alert tone="success" title="Copy your key now. It won't be shown again.">
          <div className="mt-2 flex items-center gap-2">
            <code
              className="bg-card flex-1 overflow-x-auto rounded px-2 py-1 font-mono text-xs"
              data-testid="api-key"
            >
              {created}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(created).then(() => toast.success("Copied"))}
            >
              <Copy />
            </Button>
          </div>
        </Alert>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await createKeyAction({ name, scopes });
          if (!r.ok) return toast.error(r.error);
          setCreated(r.data);
          setName("");
          router.refresh();
        }}
      >
        <Field label="Key name" htmlFor="key-name" className="min-w-56 flex-1">
          <Input
            id="key-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Accounting export, Biometric terminal"
          />
        </Field>
        {(["read", "punch", "write", "reports"] as const).map((s) => (
          <label key={s} className="flex h-10 items-center gap-2 text-sm">
            <Checkbox
              checked={scopes.includes(s)}
              onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
            />{" "}
            {s}
          </label>
        ))}
        <Button>
          <KeyRound /> Create key
        </Button>
      </form>
    </div>
  );
}

export function RevokeKey({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-danger"
      onClick={async () => {
        if (!confirm("Revoke this key? Anything using it will stop working.")) return;
        const r = await revokeKeyAction(id);
        if (r.ok) router.refresh();
        else toast.error(r.error);
      }}
    >
      <Trash2 /> Revoke
    </Button>
  );
}
