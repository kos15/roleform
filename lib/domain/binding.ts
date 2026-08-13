/**
 * The proof-of-learning loop's two bindings. PURE.
 *
 * RLE spec §1 reframes the deliverable. "Recommend learning material for the
 * gaps" is the literal request; the real goal is:
 *
 *   > Let the candidate walk into THIS interview able to truthfully claim
 *   > something they could not claim yesterday.
 *
 * A list of courses does not serve that. What serves it is binding every
 * recommended resource to three things — the gap it closes, the résumé bullet
 * it unlocks, and the interview question it answers — so the user can see what
 * the studying is FOR.
 *
 * Spec §1 puts a hard bar on that: a resource bound to fewer than all three is
 * not shown. Built literally, it withheld vetted material for 5 of 6 gaps —
 * so the bar now sits on FALSE bindings rather than absent ones. Both functions
 * below return null rather than reaching for something plausible, the material
 * is shown either way, and the loop is drawn on top wherever it was earned.
 * An absent binding is honest; a wrong one is the failure worth preventing.
 *
 * This module picks the second and third. Both picks are deterministic: an LLM
 * choosing which bullet a course unlocks would be a per-run cost for a choice
 * that term overlap and the taxonomy already answer, and it would answer it
 * differently on the same input twice.
 *
 * ── On the fabrication boundary ─────────────────────────────────────────────
 * Nothing here writes a bullet. It selects an EXISTING bullet — one the user
 * typed — that the completed learning would make legitimately rewritable. The
 * rewrite itself is staged prospectively by S6 and checked by OUT-2. That is
 * the difference between "we invented a line for your résumé" and "here is the
 * line you'll have earned", and the whole product rests on it (CLAUDE.md §3).
 */

import { hops, nodeFor } from "@/lib/catalog/taxonomy";
import type { DomainBullet, DomainRequirement } from "./types";

export interface BindableQuestion {
  id: string;
  text: string;
  type: string;
  sourceRequirementId: string | null;
}

/**
 * The bullet this gap's material would unlock.
 *
 * Preference order, strongest first:
 *
 *   1. A bullet that already evidences a taxonomy neighbour of the gap skill.
 *      This is the best possible answer — the user has done the adjacent work,
 *      so the rewrite is a genuine re-description of real experience rather
 *      than a new claim. "You built this in Flask; after the Django material
 *      that bullet can say what it actually was."
 *   2. A bullet whose text overlaps the requirement's key terms.
 *   3. Nothing. Returning null is correct and common — the material is still
 *      shown, just without a staged rewrite beside it. Reaching for the
 *      "closest" bullet when none is related is how a Rust requirement ends up
 *      rewriting a document-retrieval bullet.
 *
 * Scope breaks ties toward `work` and `project`: a bullet attached to a named
 * piece of work is the one a recruiter reads, and it is the one worth rewriting.
 */
export function bindBullet(
  skillName: string,
  requirement: DomainRequirement,
  bullets: DomainBullet[],
): DomainBullet | null {
  if (bullets.length === 0) return null;

  const target = nodeFor(skillName);

  const scored = bullets.map((bullet) => {
    // ── relevance ──────────────────────────────────────────────────────────
    // Whether this bullet has anything to do with the skill AT ALL. Kept
    // separate from the tie-breakers below, because only relevance may decide
    // whether a bullet is bound; the tie-breakers only decide which of the
    // relevant ones wins.
    let relevance = 0;

    if (target) {
      // Closest taxonomy neighbour this bullet evidences. 1 hop is worth more
      // than 2; the skill itself would not be a gap, so 0 hops cannot occur.
      let nearest = Infinity;
      for (const claimed of bullet.skillNames) {
        const distance = hops(target.name, claimed);
        if (distance !== null && distance < nearest) nearest = distance;
      }
      if (nearest <= 2) relevance += 10 - nearest * 2;
    }

    const share = overlap(requirement.text, bullet.text);
    if (share >= TERM_OVERLAP_FLOOR) relevance += share * 3;

    // ── tie-breakers ───────────────────────────────────────────────────────
    let bonus = 0;
    if (bullet.scope === "work") bonus += 1.5;
    else if (bullet.scope === "project") bonus += 1;

    // A bullet with a number in it is the one worth staging: the rewrite keeps
    // the measured result and changes only how the work is described.
    if (/\d/.test(bullet.text)) bonus += 0.5;

    return { bullet, relevance, score: relevance + bonus };
  });

  const best = scored.sort(
    (a, b) => b.score - a.score || a.bullet.id.localeCompare(b.bullet.id),
  )[0];

  // ★ No relevance, no binding.
  //
  // This used to return the top-scored bullet whenever its score was above
  // zero — but `scope` and "has a number in it" alone score ~2, so EVERY gap
  // found a bullet whether or not one had anything to do with it. The
  // end-to-end run staged this against a "Rust is a plus" requirement:
  //
  //   "Helped improve document retrieval speed by about 35% ... , with
  //    additional familiarity in Rust."
  //
  // That is a rewrite of a bullet Rust has nothing to do with, and it is
  // precisely the shape CLAUDE.md §3 forbids — a claim glued onto an unrelated
  // fact. Returning null instead sends the gap to its roadmap fallback, which
  // is the honest answer when the profile has no foothold on the skill.
  return best.relevance > 0 ? best.bullet : null;
}

/**
 * A bullet has to share at least a third of a requirement's key terms before
 * term overlap counts as evidence of relevance. Below that the matches are
 * incidental words ("the platform", "users") rather than subject matter.
 */
const TERM_OVERLAP_FLOOR = 1 / 3;

/**
 * The interview question this gap's material lets them answer.
 *
 * Two ways to earn the binding, and there is no third:
 *
 *   1. The pipeline already traced this question to this exact requirement.
 *   2. The question names the skill.
 *
 * Anything else returns null. The gap keeps its material; it simply does not
 * claim to answer a question it has no business claiming.
 *
 * ── Why there is no "any gap question" fallback ─────────────────────────────
 * There used to be one, on the reasoning that `gap`-typed questions are
 * generated precisely for things the profile cannot evidence, so any of them is
 * a reasonable default. The end-to-end run showed what that actually produces:
 * three separate gaps — TypeScript, Kubernetes and Next.js — all bound to the
 * same question about Playwright and React Testing Library, because none of
 * them matched anything and all three grabbed the first gap question in the
 * list.
 *
 * "The question it answers" then becomes false on three cards out of six, on
 * the one surface whose entire purpose is that the connection is real. A
 * binding that is merely plausible is worse than no binding, because the user
 * cannot tell the difference and we can.
 *
 * `used` carries the ids already claimed by earlier gaps. A question answers
 * one gap; handing the same one to three of them would restate the same
 * failure in a quieter way.
 */
export function bindQuestion(
  skillName: string,
  requirement: DomainRequirement,
  questions: BindableQuestion[],
  used: Set<string> = new Set(),
): BindableQuestion | null {
  if (questions.length === 0) return null;
  const available = questions.filter((q) => !used.has(q.id));

  const direct = available.find((q) => q.sourceRequirementId === requirement.id);
  if (direct) return direct;

  const needle = skillName.toLowerCase();
  return available.find((q) => q.text.toLowerCase().includes(needle)) ?? null;
}

/* --------------------------------------------------------------------- utils */

const STOPWORDS = new Set([
  "with","and","the","for","you","our","are","have","has","will","this","that","from","your",
  "who","all","any","its","their","them","they","must","should","able","work","working","team",
  "experience","years","year","using","use","used","into","across","within","plus","etc","other",
]);

/** Share of the requirement's key terms that appear in the bullet, 0–1. */
function overlap(requirementText: string, bulletText: string): number {
  const terms = [
    ...new Set(
      requirementText
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 8);
  if (terms.length === 0) return 0;

  const haystack = bulletText.toLowerCase();
  return terms.filter((t) => haystack.includes(t)).length / terms.length;
}
