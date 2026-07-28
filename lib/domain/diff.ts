/**
 * Word-level diff for the preview screen. PURE.
 *
 * Changes are highlighted BY DEFAULT, not behind a toggle (plan M4.6) — the
 * user should never have to hunt for what we altered in their own words.
 */

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
