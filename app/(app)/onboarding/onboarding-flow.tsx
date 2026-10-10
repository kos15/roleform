"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Circle, ClipboardPaste, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button, Card, ErrorRegion, Tag, Textarea } from "@/components/ui";
import {
  commitProfile,
  extractProfile,
  pasteResume,
  transcribeResume,
  uploadResume,
  type UploadedResume,
} from "@/app/actions/onboarding";
import type { DraftResume, ExtractProfileResult } from "@/lib/ai/schemas/resume-json";
import type { AppError, ModelFailure, Result } from "@/lib/domain/types";
import { ACCEPT_ATTR, ACCEPTED_SHORT, MAX_UPLOAD_BYTES } from "@/lib/extract/formats";
import { ReviewScreen } from "./review-screen";

/**
 * Onboarding (F1): upload → read → structure → review.
 *
 * Every stage is shown as it runs, because the slow one (structuring, 15–45 s
 * at the strong tier) used to sit behind a single "Reading…" line and then
 * either worked or dropped the user back at the drop zone with one sentence.
 * Now each attempt is visible, a failed attempt is retried with the reason it
 * failed (lib/ai/extract-profile.ts), and a final failure keeps the upload so
 * "Try again" resumes at the stage that failed instead of starting over.
 */

/** Mirrors EXTRACT_ATTEMPTS in lib/ai/extract-profile.ts (server-only). */
const ATTEMPTS = 3;
const MIN_PASTE = 200;

type StepKey = "upload" | "read" | "structure";
type StepState = "pending" | "active" | "done" | "failed";

interface Progress {
  steps: Record<StepKey, StepState>;
  detail: Partial<Record<StepKey, string>>;
}

interface Doc {
  documentId: string;
  needsOcr: boolean;
}

type Phase =
  | { kind: "idle" }
  | { kind: "paste" }
  | { kind: "working" }
  | { kind: "failed"; step: StepKey; error: { title: string; detail?: string }; canResume: boolean }
  /** `saving` keeps the review mounted, so a failed save loses no edits. */
  | { kind: "review"; draft: ExtractProfileResult; saving: boolean };

const FRESH: Progress = {
  steps: { upload: "pending", read: "pending", structure: "pending" },
  detail: {},
};

const LABELS: Record<StepKey, string> = {
  upload: "Upload",
  read: "Read the text",
  structure: "Build your profile",
};

const RETRY_REASON: Partial<Record<ModelFailure, string>> = {
  truncated: "the last try ran out of room, so this one gets more",
  schema: "the last try came back incomplete",
  verify: "the last try missed your bullets",
  transient: "the AI service was busy",
};

/** A thrown server action (network drop, function timeout) reads as transient. */
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return {
      ok: false,
      error: {
        code: "model_failed",
        message: "The connection dropped before we heard back.",
        failure: "transient",
      } satisfies AppError,
    };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function OnboardingFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [progress, setProgress] = useState<Progress>(FRESH);
  const [filename, setFilename] = useState("");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasted, setPasted] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [, startTransition] = useTransition();
  const running = useRef(false);

  // Elapsed seconds on the active step, so a 30-second wait reads as progress.
  // Resets on each new attempt too, since the detail line changes with it.
  const activeStep = (Object.keys(progress.steps) as StepKey[]).find((k) => progress.steps[k] === "active");
  const activeDetail = activeStep ? progress.detail[activeStep] : undefined;
  useEffect(() => {
    setElapsed(0);
    if (!activeStep) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activeStep, activeDetail]);

  function mark(step: StepKey, state: StepState, detail?: string) {
    setProgress((p) => ({
      steps: { ...p.steps, [step]: state },
      detail: { ...p.detail, [step]: detail },
    }));
  }

  function fail(step: StepKey, error: AppError, canResume: boolean) {
    mark(step, "failed", undefined);
    setPhase({ kind: "failed", step, error: { title: error.message }, canResume });
    running.current = false;
  }

  async function start(source: { file: File } | { text: string }) {
    if (running.current) return;
    running.current = true;
    setSaveError(null);
    setDoc(null);
    setProgress(FRESH);
    setPhase({ kind: "working" });

    if ("file" in source) {
      setFilename(source.file.name);
      if (source.file.size > MAX_UPLOAD_BYTES) {
        return fail("upload", { code: "invalid_input", message: "That file is over the 4 MB limit." }, false);
      }
    } else {
      setFilename("Pasted text");
    }

    mark("upload", "active", "file" in source ? `Sending ${source.file.name}` : "Saving your text");
    let uploaded: Result<UploadedResume>;
    if ("file" in source) {
      const formData = new FormData();
      formData.append("file", source.file);
      uploaded = await call(() => uploadResume(formData));
    } else {
      uploaded = await call(() => pasteResume(source.text));
    }
    if (!uploaded.ok) return fail("upload", uploaded.error, false);

    mark("upload", "done");
    const next = { documentId: uploaded.value.documentId, needsOcr: uploaded.value.needsOcr };
    setDoc(next);
    await resume(next, "read");
  }

  /** Runs from `from` to the end. Also what "Try again" calls. */
  async function resume(target: Doc, from: StepKey) {
    running.current = true;
    setPhase({ kind: "working" });

    if (from === "read") {
      if (!target.needsOcr) {
        mark("read", "done", "Text found");
      } else {
        mark("read", "active", "It's a scan or photo, so we're reading it with OCR. Usually 15–40 seconds.");
        let read = await call(() => transcribeResume(target.documentId));
        if (!read.ok && read.error.failure === "transient") {
          mark("read", "active", "The AI service was busy — trying once more.");
          await wait(2500);
          read = await call(() => transcribeResume(target.documentId));
        }
        if (!read.ok) return fail("read", read.error, read.error.failure === "transient");
        mark("read", "done", `${read.value.chars.toLocaleString()} characters read`);
      }
    }

    let previousFailure: ModelFailure | null = null;
    let last: AppError | null = null;
    let exhausted = false;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      mark(
        "structure",
        "active",
        attempt === 1
          ? "Sorting roles, dates and every bullet. Usually 15–45 seconds."
          : `Attempt ${attempt} of ${ATTEMPTS} — ${RETRY_REASON[previousFailure ?? "schema"] ?? "retrying"}.`,
      );
      const result = await call(() =>
        extractProfile({
          documentId: target.documentId,
          attempt,
          previousFailure,
          readFromImage: target.needsOcr,
        }),
      );
      if (result.ok) {
        mark("structure", "done");
        running.current = false;
        setPhase({ kind: "review", draft: result.value, saving: false });
        return;
      }
      last = result.error;
      const retryable = ["transient", "truncated", "schema", "verify"].includes(result.error.failure ?? "");
      if (!retryable) break;
      exhausted = attempt === ATTEMPTS;
      previousFailure = result.error.failure ?? null;
      if (previousFailure === "transient" && !exhausted) await wait(2000 * attempt);
    }

    mark("structure", "failed");
    running.current = false;
    setPhase({
      kind: "failed",
      step: "structure",
      error: exhausted
        ? {
            title: `We couldn't build your profile after ${ATTEMPTS} attempts.`,
            detail:
              "Your file is saved, so Try again picks up from here. If it keeps failing, paste the text instead — that skips layout problems entirely.",
          }
        : { title: last?.message ?? "We couldn't build a profile from that document." },
      canResume: true,
    });
  }

  function handleCommit(draft: ExtractProfileResult, edited: DraftResume) {
    setSaveError(null);
    setPhase({ kind: "review", draft, saving: true });
    startTransition(async () => {
      const result = await call(() => commitProfile(edited, doc?.documentId ?? null));
      if (!result.ok) {
        setSaveError(result.error.message);
        setPhase({ kind: "review", draft, saving: false });
        return;
      }
      router.push("/analyze");
    });
  }

  if (phase.kind === "review") {
    return (
      <>
        {saveError ? <ErrorRegion title={saveError} /> : null}
        <ReviewScreen
          draft={phase.draft}
          filename={filename}
          saving={phase.saving}
          onCommit={(edited) => handleCommit(phase.draft, edited)}
          onStartOver={() => {
            setPhase({ kind: "idle" });
            setProgress(FRESH);
          }}
        />
      </>
    );
  }

  if (phase.kind === "working" || phase.kind === "failed") {
    return (
      <div className="max-w-[860px] space-y-[18px]">
        <Card className="px-[26px] py-6">
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <strong className="text-base">{filename}</strong>
            {phase.kind === "working" ? <Tag tone="outline">Working</Tag> : <Tag tone="warn">Stopped</Tag>}
          </div>
          <ol className="space-y-3.5" aria-live="polite">
            {(Object.keys(LABELS) as StepKey[]).map((key) => (
              <StepRow
                key={key}
                label={LABELS[key]}
                state={progress.steps[key]}
                detail={progress.detail[key]}
                elapsed={progress.steps[key] === "active" ? elapsed : null}
              />
            ))}
            <StepRow label="Review it" state="pending" detail="You check everything before it saves." elapsed={null} />
          </ol>
        </Card>

        {phase.kind === "failed" ? (
          <>
            <ErrorRegion title={phase.error.title}>{phase.error.detail}</ErrorRegion>
            <div className="flex flex-wrap gap-3">
              {phase.canResume && doc ? (
                <Button onClick={() => void resume(doc, phase.step)}>
                  <RotateCcw className="lucide h-4 w-4" /> Try again
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setPhase({ kind: "paste" })}>
                <ClipboardPaste className="lucide h-4 w-4" /> Paste the text instead
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase({ kind: "idle" });
                  setProgress(FRESH);
                }}
              >
                Choose a different file
              </Button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (phase.kind === "paste") {
    const length = pasted.trim().length;
    return (
      <Card className="max-w-[860px] space-y-3.5 px-[26px] py-6">
        <h3 className="text-lg">Paste your résumé</h3>
        <p className="text-[15px] text-[var(--color-text-muted)]">
          Copy everything from your document and paste it here. Layout doesn&rsquo;t matter — we only need the words.
        </p>
        <Textarea
          aria-label="Résumé text"
          rows={14}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Name, contact, experience, education, skills…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={length < MIN_PASTE} onClick={() => void start({ text: pasted })}>
            Use this text
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
            Back to upload
          </Button>
          {length > 0 && length < MIN_PASTE ? (
            <span className="text-sm text-[var(--color-text-muted)]">
              {MIN_PASTE - length} more characters needed
            </span>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-[860px] space-y-[18px]">
      <label
        data-help="ob-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void start({ file });
        }}
        className="block cursor-pointer rounded-[var(--radius-xl)] border-2 border-dashed px-7 py-[clamp(2.5rem,6vw,4.5rem)] text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--color-accent-600)" : "var(--color-line-strong)",
          background: dragging ? "var(--color-accent-100)" : "var(--color-bg-raised)",
        }}
      >
        <span className="mx-auto mb-5 grid h-[68px] w-[68px] place-items-center rounded-[var(--radius-pill)] bg-[var(--color-accent-500)]">
          <Upload className="lucide h-[26px] w-[26px]" />
        </span>
        <span className="display block text-[clamp(1.6rem,3vw,2.15rem)] leading-[1.05]">
          Drop your résumé here, or choose a file
        </span>
        <span className="mb-[22px] mt-2.5 block text-[15px] text-[var(--color-text-muted)]">
          {ACCEPTED_SHORT} · up to 4 MB
        </span>
        {/* A span, not a button: the whole label is the control. */}
        <span className="btn btn-primary">Choose a file</span>
        <input
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so choosing the same file again after a failure still fires.
            e.target.value = "";
            if (file) void start({ file });
          }}
        />
      </label>

      <button
        type="button"
        className="text-[15px] font-semibold underline underline-offset-4"
        onClick={() => setPhase({ kind: "paste" })}
      >
        No file handy? Paste the text instead
      </button>

      <Card
        flat
        className="card-outline px-6 py-[22px] text-[15px] leading-relaxed text-[var(--color-text-muted)]"
      >
        <div className="mb-2 flex items-center gap-2 text-base font-extrabold text-[var(--color-text)]">
          <CheckCircle2 className="lucide h-[18px] w-[18px]" /> You review everything before it saves
        </div>
        We show you what we read, next to what you uploaded. Nothing enters your profile until
        you confirm it.
        {/* Two pills of `nowrap` text: without wrapping they push the whole
            onboarding page into a sideways scroll on any phone. */}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Tag className="min-h-8 px-3.5">No training on your documents</Tag>
          <Tag className="min-h-8 px-3.5">Delete removes the file too</Tag>
        </div>
      </Card>
    </div>
  );
}

function StepRow({
  label,
  state,
  detail,
  elapsed,
}: {
  label: string;
  state: StepState;
  detail?: string;
  elapsed: number | null;
}) {
  const icon =
    state === "done" ? (
      <CheckCircle2 className="lucide h-5 w-5" />
    ) : state === "active" ? (
      <Loader2 className="lucide h-5 w-5 animate-spin" />
    ) : state === "failed" ? (
      <AlertTriangle className="lucide h-5 w-5 text-[var(--color-accent-700)]" />
    ) : (
      <Circle className="lucide h-5 w-5 text-[var(--color-text-muted)]" />
    );
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex-none">{icon}</span>
      <span className="min-w-0">
        <span
          className={
            state === "pending" ? "block font-semibold text-[var(--color-text-muted)]" : "block font-semibold"
          }
        >
          {label}
          {elapsed !== null && elapsed >= 3 ? (
            <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">{elapsed}s</span>
          ) : null}
        </span>
        {detail ? <span className="block text-sm text-[var(--color-text-muted)]">{detail}</span> : null}
      </span>
    </li>
  );
}

export function CommitButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button onClick={onClick} disabled={disabled}>
      Save profile
    </Button>
  );
}
