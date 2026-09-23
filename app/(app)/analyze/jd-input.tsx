"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, ErrorRegion, Textarea } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import { CapWallDialog } from "@/components/cap-wall";
import { createAnalysis } from "@/app/actions/analysis";
import { SAMPLE_JD } from "@/lib/sample-jd";
import { JD_MIN_CHARS } from "@/lib/domain/guardrails";
import type { TokenWall } from "@/lib/domain/tokens";
import type { CapWall } from "@/lib/domain/quotas";

export interface InitialListing {
  id: string;
  title: string;
  company: string;
  snippet: string;
}

/**
 * F2 — JD input. Segmented control: Upload file / Paste text.
 *
 * The design's demo affordances ("try an unreadable file") ship behind
 * NEXT_PUBLIC_DEV_AFFORDANCES, never in production UI.
 */
export function JdInput({ initialListing = null }: { initialListing?: InitialListing | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  // F22 §3.5 — a job-board API returns a SNIPPET, never the full posting, so
  // "Analyse" on a saved listing pre-fills it with a notice rather than
  // pretending it is a real analysis input yet. The member still has to
  // paste the actual posting for the run to mean anything.
  const [text, setText] = useState(initialListing?.snippet ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);

  const devAffordances = process.env.NEXT_PUBLIC_DEV_AFFORDANCES === "true";
  const canSubmit = mode === "paste" ? text.trim().length >= JD_MIN_CHARS : file !== null;

  /** Rebuilt on each attempt — the file is read fresh, so this can't be cached. */
  async function payload(queue: boolean) {
    const listingId = initialListing?.id;
    return mode === "paste"
      ? { source: "paste" as const, text, queue, listingId }
      : {
          source: "upload" as const,
          filename: file!.name,
          fileBase64: Buffer.from(await file!.arrayBuffer()).toString("base64"),
          queue,
          listingId,
        };
  }

  async function submit() {
    setError(null);
    setBusy(true);

    const result = await createAnalysis(await payload(false));
    if (!result.ok) {
      // The meter and the analyses cap are the two refusals with somewhere to
      // go, so both open a dialog instead of printing a sentence into the
      // error region (F19, F23 PAY-4/PAY-5).
      if (result.error.code === "token_wall" && result.error.wall) {
        setWall(result.error.wall);
      } else if (result.error.capWall) {
        setCapWall(result.error.capWall);
      } else {
        setError(result.error.message);
      }
      setBusy(false);
      return;
    }
    router.push(`/analysis/${result.value.analysisId}`);
  }

  /**
   * "Park it" from inside the wall. Sends the same posting again with the queue
   * flag; the server re-checks the balance and only parks it if the wall is
   * still real. Throwing is what tells the dialog to say so.
   */
  async function park() {
    const result = await createAnalysis(await payload(true));
    if (!result.ok) throw new Error(result.error.message);
    router.refresh();
  }

  return (
    // The walkthrough points at the whole block rather than one mode's control:
    // which of the two is showing is the member's choice, and a spotlight that
    // moved when they switched tabs would be pointing at the tab, not the task.
    <div className="space-y-[18px]" data-tour="jd">
      {wall ? (
        <TokenWallDialog
          wall={wall}
          onClose={() => setWall(null)}
          onQueue={wall.canQueue ? park : undefined}
          onResume={submit}
          resumeLabel="Analyse the posting"
        />
      ) : null}
      {capWall ? <CapWallDialog wall={capWall} onClose={() => setCapWall(null)} /> : null}
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

      {initialListing ? (
        <p className="mb-3 rounded-[var(--radius-md)] bg-[var(--color-accent-100)] px-4 py-3 text-sm leading-relaxed">
          <strong className="font-extrabold">
            {initialListing.title} at {initialListing.company}.
          </strong>{" "}
          This is the summary the job board gave us. Paste the full posting from the listing for a
          real analysis.
        </p>
      ) : null}

      {mode === "paste" ? (
        <div className="rise-in">
          <Textarea
            aria-label="Job description text"
            rows={14}
            placeholder="Paste the full posting — responsibilities, requirements, the lot."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[22rem] rounded-[var(--radius-lg)] border-transparent bg-[var(--color-bg-raised)] px-[26px] py-6 text-[15px] leading-[1.65]"
          />
          <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3.5">
            <span className="text-sm text-[var(--color-text-muted)]">
              {text.length.toLocaleString()} characters
              {/* The floor is quoted only once there is something to measure —
                  "we need at least 200" over an empty box is a scolding. */}
              {text.length > 0 && text.trim().length < JD_MIN_CHARS ? ` · we need at least ${JD_MIN_CHARS}` : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setText(SAMPLE_JD)}>
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
                {busy ? "Starting…" : "Analyse posting"}
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
            className="block cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed px-7 py-14 text-center transition-[background-color,border-color,transform] duration-200"
            style={{
              borderColor: dragging ? "var(--color-accent-600)" : "var(--color-line-strong)",
              background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
              transform: dragging ? "scale(1.012)" : undefined,
            }}
          >
            <span
              className={`mx-auto mb-[18px] grid h-[62px] w-[62px] place-items-center rounded-[var(--radius-pill)] ${dragging ? "fig-float" : ""}`}
              style={{ background: "var(--color-accent-500)" }}
            >
              <FileUp className="lucide h-6 w-6" />
            </span>
            <span className="display block text-[28px] leading-[1.05]">
              {file
                ? file.name
                : dragging
                  ? "Drop it — we'll take it from here"
                  : "Drop the posting here, or choose a file"}
            </span>
            <span className="mb-5 mt-2 block text-sm text-[var(--color-text-muted)]">
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
              {busy ? "Starting…" : "Analyse posting"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
