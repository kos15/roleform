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
        <div className="rise-in">
          <Textarea
            aria-label="Job description text"
            rows={14}
            placeholder="Paste the full posting — responsibilities, requirements, the lot."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[16.5rem]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-[var(--color-text-muted)]">
              {text.length.toLocaleString()} characters
              {/* The floor is quoted only once there is something to measure —
                  "we need at least 120" over an empty box is a scolding. */}
              {text.length > 0 && text.trim().length < 120 ? " · we need at least 120" : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setText(SAMPLE_JD)}>
                Load sample posting
              </Button>
              {devAffordances ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setText("not a job posting")}
                >
                  Try: an unreadable input
                </Button>
              ) : null}
              <Button onClick={submit} disabled={!canSubmit || busy} busy={busy}>
                {busy ? "Starting…" : "Analyze posting"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rise-in">
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
            className="block cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed px-7 py-10 text-center transition-[background-color,border-color,transform] duration-200"
            style={{
              borderColor: dragging ? "var(--color-accent-500)" : "var(--color-line)",
              background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
              transform: dragging ? "scale(1.012)" : undefined,
            }}
          >
            <span
              className={`mx-auto mb-4 grid h-[58px] w-[58px] place-items-center rounded-[var(--radius-pill)] ${dragging ? "fig-float" : ""}`}
              style={{ background: "var(--color-accent-200)" }}
            >
              <FileUp className="lucide h-6 w-6 text-[var(--color-accent-800)]" />
            </span>
            <span className="block font-[family-name:var(--font-heading)] text-xl">
              {file
                ? file.name
                : dragging
                  ? "Drop it — we'll take it from here"
                  : "Drop the posting here, or choose a file"}
            </span>
            <span className="mb-4 mt-1.5 block text-sm text-[var(--color-text-muted)]">
              PDF, DOCX or TXT · up to 5 MB
            </span>
            {/* A span, not a button: the whole label is the control, and a nested
                button would swallow the click that opens the file picker. */}
            <span className="btn btn-secondary">Choose a file</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,text/plain"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="mt-3 flex justify-end">
            <Button onClick={submit} disabled={!canSubmit || busy} busy={busy}>
              {busy ? "Starting…" : "Analyze posting"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
