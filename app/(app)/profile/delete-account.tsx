"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, ErrorRegion } from "@/components/ui";
import { deleteAccount } from "@/app/actions/account";

/**
 * M7.4 — delete means hard delete of rows AND storage objects.
 *
 * Typed confirmation rather than a browser confirm(): this is irreversible, and
 * a dialog you can dismiss by reflex is not consent.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.push("/");
  }

  return (
    <Card>
      <h3 className="mb-2">Delete everything</h3>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Removes your profile, every analysis, and the résumé files themselves from storage.
        Immediate and irreversible. Backups purge within 30 days.
      </p>
      {error ? <ErrorRegion title="Deletion failed">{error}</ErrorRegion> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          className="max-w-xs"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
        <Button
          variant="secondary"
          disabled={confirmText !== "DELETE" || busy}
          onClick={run}
        >
          {busy ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </Card>
  );
}
