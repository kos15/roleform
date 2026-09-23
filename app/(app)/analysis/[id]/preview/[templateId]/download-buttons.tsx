"use client";

import { useState } from "react";
import { ExternalLink, FileDown } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { exportDraft } from "@/app/actions/export";

export function DownloadButtons({ draftId }: { draftId: string }) {
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    setError(null);

    // A PDF opens in its own tab; a DOCX downloads, because a browser tab has
    // nothing useful to do with one.
    //
    // The tab is claimed HERE, synchronously, and pointed at the file once the
    // render finishes. Calling window.open after the await would land outside
    // the click's own task and every popup blocker would eat it. `noopener`
    // is not passed because it makes window.open return null — the handle is
    // the whole point — so the opener is severed on the handle instead.
    const tab = format === "pdf" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;

    const result = await exportDraft(draftId, format);
    setBusy(null);

    if (!result.ok) {
      tab?.close();
      setError(result.error.message);
      return;
    }

    if (format === "pdf" && tab) tab.location.href = result.value.signedUrl;
    else window.location.href = result.value.signedUrl;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2.5">
        {/* DOCX first: it extracted more reliably than PDF in 6 of 8 tested ATS
            platforms (specs §1), so it is the submission artifact. */}
        <Button size="sm" onClick={() => download("docx")} disabled={busy !== null} busy={busy === "docx"}>
          <FileDown className="lucide h-4 w-4" />
          {busy === "docx" ? "Building…" : "Download DOCX"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => download("pdf")}
          disabled={busy !== null}
          busy={busy === "pdf"}
        >
          <ExternalLink className="lucide h-4 w-4" />
          {busy === "pdf" ? "Building…" : "Open PDF"}
        </Button>
      </div>
      {error ? <ErrorRegion title="That export failed">{error}</ErrorRegion> : null}
    </div>
  );
}
