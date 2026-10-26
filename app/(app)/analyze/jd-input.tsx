"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, ErrorRegion, Textarea } from "@/components/ui";
import { TokenWallDialog } from "@/components/token-wall";
import { CapWallDialog } from "@/components/cap-wall";
import { createAnalysis } from "@/app/actions/analysis";
import { createRound, type RoundInputValue } from "@/app/actions/rounds";
import { SAMPLE_JD } from "@/lib/shared/sample-jd";
import { JD_MIN_CHARS } from "@/lib/domain/guardrails";
import { ACCEPT_DOCUMENT_ATTR, ACCEPTED_DOCUMENT_SHORT } from "@/lib/services/extract/formats";
import { DATE_ONLY_HOUR, DATE_ONLY_LEADS, DEFAULT_LEADS, MAX_DAYS_AHEAD } from "@/lib/domain/reminders";
import type { TokenWall } from "@/lib/domain/tokens";
import type { CapWall } from "@/lib/domain/quotas";

export interface InitialListing {
  id: string;
  title: string;
  company: string;
  snippet: string;
  /**
   * The full posting, when the provider returned one (freehire, F22.1).
   * Empty for snippet-only sources — then the notice asks for the posting.
   */
  description: string;
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
  // F22 §3.5 — most job-board APIs return a SNIPPET, never the full posting,
  // so "Analyse" on such a listing pre-fills it with a notice rather than
  // pretending it is a real analysis input yet. F22.1: a provider that does
  // return the whole posting (freehire) pre-fills that instead, and the
  // notice says where it came from so the member can still check it.
  const [text, setText] = useState(initialListing?.description || initialListing?.snippet || "");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wall, setWall] = useState<TokenWall | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);
  // F29 from the front door: the interview date, if the member already has
  // one. Optional in every sense — empty is the default and changes nothing.
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  /** The analysis started but its round didn't save — say so before moving on. */
  const [roundFailed, setRoundFailed] = useState<{ analysisId: string; message: string } | null>(null);
  // Set after mount: "today" is the member's date, and the server rendering
  // this form may be on the other side of midnight from them.
  const [today, setToday] = useState<string | undefined>(undefined);
  useEffect(() => setToday(todayLocal()), []);

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

  /**
   * The round the member described, or null for none. Checked before the
   * analysis is created, so a mistyped date never leaves a run behind it.
   */
  function interviewRound(): { ok: true; value: RoundInputValue | null } | { ok: false; message: string } {
    if (!interviewDate) {
      return interviewTime
        ? { ok: false, message: "Add the interview date too, or clear the time." }
        : { ok: true, value: null };
    }
    const hasTime = interviewTime !== "";
    const pad = (n: number) => String(n).padStart(2, "0");
    // No zone suffix: the browser reads this as the member's own wall clock.
    const at = new Date(`${interviewDate}T${hasTime ? interviewTime : `${pad(DATE_ONLY_HOUR)}:00`}`);
    if (Number.isNaN(at.getTime())) return { ok: false, message: "That interview date doesn't look right." };
    if (at.getTime() <= Date.now()) {
      return {
        ok: false,
        message: hasTime
          ? "That interview time has already passed — check the date."
          : "That date has already passed. If the interview is later today, add the time.",
      };
    }
    if (at.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * 3600_000) {
      return { ok: false, message: "That date is more than a year away — check the year." };
    }
    return {
      ok: true,
      value: {
        kind: "other",
        // A date with no time is stored at a placeholder hour; the name says
        // so, so the Rounds tab never presents 10:00 as something they told us.
        label: hasTime ? "Interview" : "Interview · time to confirm",
        scheduledAt: at.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        notes: "",
        leads: [...(hasTime ? DEFAULT_LEADS : DATE_ONLY_LEADS)],
      },
    };
  }

  /** Files the round under the new analysis. False (and says why) if it didn't save. */
  async function saveRound(analysisId: string, round: RoundInputValue): Promise<boolean> {
    const saved = await createRound(analysisId, round).catch(() => null);
    if (saved?.ok) return true;
    setRoundFailed({
      analysisId,
      message: saved ? saved.error.message : "We couldn\u2019t reach Roleform to save it.",
    });
    return false;
  }

  async function submit() {
    setError(null);
    const round = interviewRound();
    if (!round.ok) {
      setError(round.message);
      return;
    }
    setBusy(true);

    // A thrown action — a dropped connection, a body the platform refused,
    // a tab older than the current deploy — used to leave the button busy
    // forever with nothing said. Now it says so and the button comes back.
    let result: Awaited<ReturnType<typeof createAnalysis>>;
    try {
      result = await createAnalysis(await payload(false));
    } catch {
      setError("We couldn\u2019t reach Roleform. Check your connection and try again.");
      setBusy(false);
      return;
    }
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
    if (round.value && !(await saveRound(result.value.analysisId, round.value))) {
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
    const round = interviewRound();
    if (!round.ok) throw new Error(round.message);
    const result = await createAnalysis(await payload(true));
    if (!result.ok) throw new Error(result.error.message);
    // A parked posting can carry its interview date too — the reminders are
    // what make parking it until the reset safe to do.
    if (round.value) await saveRound(result.value.analysisId, round.value);
    router.refresh();
  }

  const interviewField = (
    <fieldset className="rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-4 py-4 sm:px-[22px] sm:py-[18px]">
      <legend className="sr-only">Interview date (optional)</legend>
      <p aria-hidden className="mb-1 text-[15px] font-extrabold">
        Interview date{" "}
        <span className="font-semibold text-[var(--color-text-muted)]">· optional</span>
      </p>
      <p className="mb-3.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
        We&rsquo;ll remind you before it. You can add rounds later.
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-0 flex-1 basis-36 flex-col gap-1.5 text-[13px] font-extrabold sm:flex-none">
          Date
          <input
            type="date"
            className="input w-full sm:w-[13rem]"
            value={interviewDate}
            min={today}
            onChange={(e) => setInterviewDate(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="flex min-w-0 flex-1 basis-28 flex-col gap-1.5 text-[13px] font-extrabold sm:flex-none">
          Time (optional)
          <input
            type="time"
            className="input w-full sm:w-[10rem]"
            value={interviewTime}
            onChange={(e) => setInterviewTime(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <p className="more-copy mt-3 text-[13px] text-[var(--color-text-muted)]">
        Turn on notifications from the Rounds tab or your profile to get them.
      </p>
    </fieldset>
  );

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

      {roundFailed ? (
        <div className="space-y-3">
          <ErrorRegion title="Your analysis started, but the interview date wasn't saved">
            {roundFailed.message} You can add it from the Rounds tab once the results are ready.
          </ErrorRegion>
          <Button onClick={() => router.push(`/analysis/${roundFailed.analysisId}`)}>
            Continue to the analysis
          </Button>
        </div>
      ) : null}

      {initialListing ? (
        <p className="mb-3 rounded-[var(--radius-md)] bg-[var(--color-accent-100)] px-4 py-3 text-sm leading-relaxed">
          <strong className="font-extrabold">
            {initialListing.title} at {initialListing.company}.
          </strong>{" "}
          {initialListing.description
            ? "Full posting from the job board. Boards sometimes trim the end."
            : "Only the board's summary. Paste the full posting for a real analysis."}
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
            className="min-h-[16rem] rounded-[var(--radius-lg)] border-transparent bg-[var(--color-bg-raised)] px-4 py-4 text-[15px] leading-[1.65] sm:min-h-[22rem] sm:px-[26px] sm:py-6"
          />
          <div className="mt-[18px]">{interviewField}</div>
          <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3.5">
            <span className="text-sm text-[var(--color-text-muted)]">
              {text.length.toLocaleString()} characters
              {/* The floor is quoted only once there is something to measure —
                  "we need at least 200" over an empty box is a scolding. */}
              {text.length > 0 && text.trim().length < JD_MIN_CHARS ? ` · we need at least ${JD_MIN_CHARS}` : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" data-help="load-sample" onClick={() => setText(SAMPLE_JD)}>
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
              <Button data-help="analyze-btn" onClick={submit} disabled={!canSubmit || busy} busy={busy}>
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
            className="block cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed px-5 py-9 text-center sm:px-7 sm:py-14 transition-[background-color,border-color,transform] duration-200"
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
            <span className="display block break-words text-[22px] leading-[1.05] sm:text-[28px]">
              {file
                ? file.name
                : dragging
                  ? "Drop it — we'll take it from here"
                  : "Drop the posting here"}
            </span>
            <span className="mb-5 mt-2 block text-sm text-[var(--color-text-muted)]">
              {ACCEPTED_DOCUMENT_SHORT} · up to 4 MB
            </span>
            {/* A span, not a button: the whole label is the control, and a nested
                button would swallow the click that opens the file picker. */}
            <span className="btn btn-secondary">Choose a file</span>
            <input
              type="file"
              accept={ACCEPT_DOCUMENT_ATTR}
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="mt-[18px]">{interviewField}</div>

          <div className="mt-3 flex justify-end">
            <Button data-help="analyze-btn" onClick={submit} disabled={!canSubmit || busy} busy={busy}>
              {busy ? "Starting…" : "Analyse posting"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Today as `<input type="date">` wants it, in the member's own zone. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
