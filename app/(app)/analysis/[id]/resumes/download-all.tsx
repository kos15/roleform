"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { exportAll } from "@/app/actions/export";

/** 6 templates × 2 formats, zipped (F9). p95 measured server-side (M6.5). */
export function DownloadAll({ analysisId }: { analysisId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await exportAll(analysisId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    window.location.href = result.value.signedUrl;
  }

  return (
    <div>
      <Button onClick={run} disabled={busy} busy={busy} className="min-h-[52px] px-[26px] text-base">
        <Download className="lucide h-[18px] w-[18px]" />
        {busy ? "Building 12 files…" : "Download all"}
      </Button>
      {error ? (
        <div className="mt-2">
          <ErrorRegion title="That download failed">{error}</ErrorRegion>
        </div>
      ) : null}
    </div>
  );
}
