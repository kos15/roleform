"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, ErrorRegion } from "@/components/ui";
import { WaitOverlay } from "@/components/wait-overlay";
import { exportAll } from "@/app/actions/export";

/**
 * Every draft × 2 formats, zipped (F9). p95 measured server-side (M6.5).
 *
 * No file count in the copy: how many drafts a run has is `capResumes` per
 * member (CLAUDE.md §5), so any fixed number is wrong for somebody.
 */
export function DownloadAll({ analysisId }: { analysisId: string }) {
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "busy";

  async function run() {
    setPhase("busy");
    setError(null);
    // A thrown action used to leave the button stuck on its busy label.
    const result = await exportAll(analysisId).catch(() => null);
    if (!result || !result.ok) {
      setPhase("idle");
      setError(result ? result.error.message : "We couldn’t reach Roleform. Check your connection and try again.");
      return;
    }
    // The card plays its finish while the browser starts the download.
    setPhase("done");
    window.location.href = result.value.signedUrl;
    setTimeout(() => setPhase("idle"), 2_400);
  }

  return (
    <div>
      <Button onClick={run} disabled={busy} busy={busy} className="min-h-[52px] px-[26px] text-base">
        {busy ? null : <Download className="lucide h-[18px] w-[18px]" />}
        {busy ? "Building your files…" : "Download all"}
      </Button>
      <WaitOverlay
        open={phase !== "idle"}
        kind="papers"
        eyebrow="Download all"
        lines={["Building your files"]}
        state={phase === "done" ? "done" : "working"}
        sub="Every draft as PDF and DOCX, in one zip."
        still="Still building. PDFs take the longest."
        long="Taking longer than usual. The download starts on its own."
        done="Your files are ready"
      />
      {error ? (
        <div className="mt-2">
          <ErrorRegion title="That download failed">{error}</ErrorRegion>
        </div>
      ) : null}
    </div>
  );
}
