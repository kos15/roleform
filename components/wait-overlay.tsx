"use client";

import { useEffect } from "react";

/**
 * The typed surface over `<rf-wait>` (components/rf-wait/rf-wait.js), the
 * loader from the "Roleform waits" design handoff.
 *
 * - galaxy — the analysis pipeline
 * - papers — résumé import, building files
 * - blobs  — quick AI work: revision deck, quiz round, code challenge
 *
 * `stage` must come from real state (the stage the server says is running),
 * or be left out — then the card shows one line and no pips. Never drive it
 * from a timer: the parsing screen's rule is that a spinner that lies is worse
 * than an error. With no stage, pass a single line; several lines with no
 * stage rotate on a clock, which reads as progress we did not measure.
 *
 * There is no cancel button. `state="done"` plays the finish and the card
 * closes itself; set `open={false}` to close it at once (the caller's own
 * error screen then says what failed).
 */
export type WaitKind = "galaxy" | "papers" | "blobs";

export function WaitOverlay({
  open,
  kind,
  eyebrow,
  lines,
  stage,
  state = "working",
  sub,
  still,
  long,
  done,
  run,
}: {
  open: boolean;
  kind: WaitKind;
  eyebrow?: string;
  lines: string[];
  stage?: number;
  state?: "working" | "done" | "error";
  /** Shown from the start. */
  sub?: string;
  /** Replaces `sub` after 6 s. */
  still?: string;
  /** Replaces `still` after 20 s. */
  long?: string;
  /** The heading once `state` is "done". */
  done?: string;
  /** Change to restart the card's clock and motion for a new attempt. */
  run?: number;
}) {
  useRfWait();
  return (
    <rf-wait
      open={open ? "yes" : "no"}
      kind={kind}
      eyebrow={eyebrow ?? ""}
      lines={lines.join("|")}
      stage={String(stage ?? -1)}
      state={state}
      sub={sub ?? ""}
      still={still ?? ""}
      long={long ?? ""}
      done={done ?? ""}
      run={String(run ?? 0)}
    />
  );
}

/** Defines the element once, client-side. Safe to call from many components. */
export function useRfWait() {
  useEffect(() => {
    void import("./rf-wait/rf-wait.js");
  }, []);
}

/** Mounted once in the root layout so `Button busy` dots render anywhere. */
export function RfWaitDefine() {
  useRfWait();
  return null;
}
