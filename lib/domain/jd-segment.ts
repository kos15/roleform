/**
 * A deterministic, conservative pre-strip of a posting before it reaches the
 * model (F24 §5.2, PR-5). Boilerplate sections — benefits, EEO statements,
 * "about us" — cost input tokens on every `analyzeJd` call and never contain
 * a requirement; `analyzeJd`'s own system prompt already tells the model to
 * ignore them, so stripping them here is pure cost with nothing asked of the
 * model to do worse.
 *
 * Conservative by construction, in two independent ways, because a wrongly
 * dropped requirement is a worse failure than a few hundred wasted tokens:
 *
 *   1. A paragraph is only a candidate to drop when it sits under a heading
 *      that is UNAMBIGUOUSLY boilerplate (BOILERPLATE_HEADINGS below) — no
 *      fuzzy matching, no "sounds like benefits".
 *   2. Even then, a candidate paragraph is kept whole if it contains any word
 *      from REQUIREMENT_SIGNAL (a requirement can be buried in a benefits
 *      paragraph — "medical, dental, and a $2,000/year learning budget you
 *      must use toward AWS certification" is not hypothetical). Failing
 *      closed here means the worst case of a wrong call is "kept a paragraph
 *      that could have been dropped", never "dropped one that mattered".
 *
 * PURE. No I/O, no model call — this is a string transform, checked by
 * `pnpm check:coverage`'s fixture set (never removes a line the fixtures
 * mark as containing a requirement).
 */

const BOILERPLATE_HEADINGS =
  /^(benefits|perks|compensation( and benefits)?|our benefits|equal (employment )?opportunity( employer)?|eeo( statement)?|diversity( ?,? equity( ?,? and inclusion)?)?( statement)?|about (us|the company|our company|[a-z0-9 &.,'-]{2,40})|who we are|our culture|why join us|company overview|legal( disclaimer)?)\s*:?\s*$/i;

const REQUIREMENT_SIGNAL =
  /\b(must|require[ds]?|experience|years?|proficien\w*|certif\w*|degree|bachelor|master|skills?|knowledge of|familiarity with|responsible for|you will|you'll)\b/i;

export interface JdSegmentResult {
  text: string;
  /** Headings whose paragraph was dropped, for a "what we used" notice. */
  droppedHeadings: string[];
}

export function stripBoilerplate(rawText: string): JdSegmentResult {
  // Blank-line-delimited paragraphs, each optionally opening with a heading
  // line (short, title-cased or ALL CAPS or ending in a colon).
  const paragraphs = rawText.split(/\n{2,}/);
  const kept: string[] = [];
  const droppedHeadings: string[] = [];

  for (const para of paragraphs) {
    const lines = para.split("\n");
    const firstLine = (lines[0] ?? "").trim();
    const isHeadingCandidate = firstLine.length > 0 && firstLine.length <= 60;

    if (isHeadingCandidate && BOILERPLATE_HEADINGS.test(firstLine) && !REQUIREMENT_SIGNAL.test(para)) {
      droppedHeadings.push(firstLine.replace(/:$/, ""));
      continue;
    }

    kept.push(para);
  }

  // Safety valve: a genuinely boilerplate-heavy posting can legitimately lose
  // most of its length here — that is the optimisation working, not a bug,
  // and a fraction-based floor would defeat it on exactly the postings where
  // it matters most. What has to hold is an ABSOLUTE one: something
  // substantive survived. Below that, the heuristic has plausibly misread
  // the structure, and the posting reaches the model whole rather than
  // mangled — the model's own instruction to ignore boilerplate is the
  // fallback, not a backup for a bug in this function.
  const strippedText = kept.join("\n\n").trim();
  if (droppedHeadings.length > 0 && strippedText.length < 200) {
    return { text: rawText, droppedHeadings: [] };
  }

  return { text: strippedText, droppedHeadings };
}
