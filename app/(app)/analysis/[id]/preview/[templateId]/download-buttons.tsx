"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { exportDraft } from "@/app/actions/export";

export function DownloadButtons({ draftId }: { draftId: string }) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    setError(null);
    const result = await exportDraft(draftId, format);
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    window.location.href = result.value.signedUrl;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* DOCX first: it extracted more reliably than PDF in 6 of 8 tested ATS
            platforms (specs §1), so it is the submission artifact. */}
        <Button size="sm" onClick={() => download("docx")} disabled={busy !== null}>
          <FileDown className="lucide h-4 w-4" />
          {busy === "docx" ? "Building…" : "Download DOCX"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => download("pdf")}
          disabled={busy !== null}
        >
          {busy === "pdf" ? "Building…" : "Download PDF"}
        </Button>
      </div>
      {error ? <ErrorRegion title="That export failed">{error}</ErrorRegion> : null}
    </div>
  );
}
