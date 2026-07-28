"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, ErrorRegion, Textarea } from "@/components/ui";
import { createAnalysis } from "@/app/actions/analysis";
import { SAMPLE_JD } from "@/lib/sample-jd";

/**
 * F2 — JD input. Segmented control: Upload file / Paste text.
 *
 * The design's demo affordances ("try an unreadable file") ship behind
 * NEXT_PUBLIC_DEV_AFFORDANCES, never in production UI.
 */
export function JdInput() {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const devAffordances = process.env.NEXT_PUBLIC_DEV_AFFORDANCES === "true";
  const canSubmit = mode === "paste" ? text.trim().length >= 120 : file !== null;

  async function submit() {
    setError(null);
    setBusy(true);

    const input =
      mode === "paste"
        ? { source: "paste" as const, text }
        : {
            source: "upload" as const,
            filename: file!.name,
            fileBase64: Buffer.from(await file!.arrayBuffer()).toString("base64"),
          };

    const result = await createAnalysis(input);
    if (!result.ok) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    router.push(`/analysis/${result.value.analysisId}`);
  }

  return (
    <div className="space-y-4">
      <div className="seg" role="tablist" aria-label="Job description input method">
        <button
          role="tab"
          aria-selected={mode === "upload"}
          onClick={() => setMode("upload")}
          type="button"
        >
          Upload file
        </button>
        <button
          role="tab"
          aria-selected={mode === "paste"}
          onClick={() => setMode("paste")}
          type="button"
        >
          Paste text
        </button>
      </div>

      {error ? <ErrorRegion title="We couldn't use that">{error}</ErrorRegion> : null}

      {mode === "paste" ? (
        <div>
          <Textarea
            aria-label="Job description text"
            rows={14}
            placeholder="Paste the full posting — responsibilities, requirements, the lot."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
            <span>{text.length.toLocaleString()} characters</span>
            <button
              type="button"
              className="font-semibold text-accent-body"
              onClick={() => setText(SAMPLE_JD)}
            >
              Load sample JD
            </button>
            {devAffordances ? (
              <button
                type="button"
                className="font-semibold text-accent-body"
                onClick={() => setText("not a job posting")}
              >
                Try: an unreadable input
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) setFile(dropped);
          }}
          className="block cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed p-12 text-center"
          style={{
            borderColor: dragging ? "var(--color-accent-500)" : "var(--color-line)",
            background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
          }}
        >
          <FileUp className="lucide mx-auto mb-3 h-7 w-7 text-[var(--color-accent-600)]" />
          <span className="block font-semibold">
            {file ? file.name : "Drop the posting here, or choose a file"}
          </span>
          <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
            PDF, DOCX or TXT, up to 5 MB
          </span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,text/plain"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}

      <Button onClick={submit} disabled={!canSubmit || busy}>
        {busy ? "Starting…" : "Analyze job description"}
      </Button>
    </div>
  );
}
