/**
 * Word-level diff for the preview screen. PURE.
 *
 * Changes are highlighted BY DEFAULT, not behind a toggle (plan M4.6) — the
 * user should never have to hunt for what we altered in their own words.
 */
import type { Transform } from "./types";

export type DiffOp = { kind: "same" | "added" | "removed"; text: string };

/** Longest-common-subsequence word diff. Small inputs (one bullet), so O(n·m) is fine. */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenise(before);
  const b = tokenise(after);

  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        normalise(a[i]) === normalise(b[j])
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (normalise(a[i]) === normalise(b[j])) {
      push(ops, "same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(ops, "removed", a[i]);
      i++;
    } else {
      push(ops, "added", b[j]);
      j++;
    }
  }
  while (i < a.length) push(ops, "removed", a[i++]);
  while (j < b.length) push(ops, "added", b[j++]);
  return ops;
}

function push(ops: DiffOp[], kind: DiffOp["kind"], text: string) {
  const last = ops[ops.length - 1];
  if (last && last.kind === kind) last.text += text;
  else ops.push({ kind, text });
}

function tokenise(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[.,;:()]/g, "");
}

/** One-line summary of what changed across a draft, for the card and rail. */
export function summariseChanges(
  pairs: Array<{ original: string; rewritten: string }>,
): string {
  const changed = pairs.filter((p) => p.original.trim() !== p.rewritten.trim()).length;
  if (changed === 0) return "Nothing needed rewording — your bullets already match the posting's language.";
  return `${changed} of ${pairs.length} bullets reworded to the posting's vocabulary; the rest kept verbatim.`;
}

/* ------------------------------------------------- tailoring outcome helpers */

export interface TailorOutcome {
  originalText: string;
  rewrittenText: string;
  transform: Transform;
  blockedBy: string[];
}

export type BlockCause = "checker" | "guard" | "ceiling" | "deadline" | "transient";

/** Why a bullet stayed verbatim. A fabrication finding looks like `tool:Go`. */
export function blockCause(blockedBy: readonly string[]): BlockCause | null {
  if (blockedBy.length === 0) return null;
  if (blockedBy.includes("token_ceiling")) return "ceiling";
  if (blockedBy.includes("deadline")) return "deadline";
  if (blockedBy.includes("checker")) return "checker";
  if (blockedBy.some((b) => b.includes(":"))) return "guard";
  return "transient";
}

export const STOPPED_PARTWAY =
  "We stopped rewriting partway through — the rest of your bullets kept their original wording.";

export function buildChangeList(tailored: readonly TailorOutcome[]): string[] {
  const causes = tailored.map((t) => blockCause(t.blockedBy));
  const changed = tailored.filter((t) => t.transform === "rephrase" || t.transform === "requantify");
  const rejected = causes.filter((c) => c === "checker" || c === "guard").length;
  const out = [summariseChanges(tailored.map((t) => ({ original: t.originalText, rewritten: t.rewrittenText })))];
  if (changed.length > 0) out.push("Bullets reordered to lead with what the posting asks for most often.");
  if (rejected > 0) {
    // Surfaced deliberately: the guard firing is information, not an internal detail.
    out.push(`${rejected} rewrite(s) were rejected for adding detail you hadn't stated, and kept verbatim.`);
  }
  if (causes.some((c) => c === "ceiling" || c === "deadline")) out.push(STOPPED_PARTWAY);
  return out;
}

export interface TailorTally {
  bullets: number;
  rewritten: number;
  verbatim: number;
  transient: number;
  checker: number;
  guard: number;
  ceiling: number;
  deadline: number;
}

/** Counts only — safe to log (N7). */
export function tailorTally(tailored: readonly TailorOutcome[]): TailorTally {
  const tally: TailorTally = {
    bullets: tailored.length, rewritten: 0, verbatim: 0,
    transient: 0, checker: 0, guard: 0, ceiling: 0, deadline: 0,
  };
  for (const t of tailored) {
    if (t.transform === "rephrase" || t.transform === "requantify") tally.rewritten++;
    else if (t.transform === "verbatim") tally.verbatim++;
    const cause = blockCause(t.blockedBy);
    if (cause) tally[cause]++;
  }
  return tally;
}
