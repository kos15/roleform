/**
 * Deterministic ranking of job listings against a profile (F22). PURE. No
 * model call — "fit" is skill overlap, computed the same way every time for
 * the same inputs, never a number a model produced (N20).
 */

export interface RankableListing {
  id: string;
  title: string;
  snippet: string;
  postedAt: Date | null;
  /** The order this listing's source was queried in — the final tie-breaker. */
  sourceOrder: number;
}

export interface RankedListing {
  id: string;
  /** Canonical profile skill names found in the title or snippet, in profile order. */
  matchedSkills: string[];
  score: number;
}

/**
 * Skill overlap first (how many of the profile's skills appear in the
 * title/snippet, weighted double for a title hit), recency second, the
 * order sources were queried third. Never a percentage, never "match" (N20)
 * — the UI renders `matchedSkills` as named chips, not this score.
 */
export function rankListings(listings: RankableListing[], profileSkills: string[]): RankedListing[] {
  const needles = profileSkills.map((s) => s.toLowerCase()).filter(Boolean);

  const ranked = listings.map((listing) => {
    const title = listing.title.toLowerCase();
    const snippet = listing.snippet.toLowerCase();
    const matchedSkills: string[] = [];
    let overlapScore = 0;

    for (let i = 0; i < profileSkills.length; i++) {
      const needle = needles[i];
      if (!needle) continue;
      const inTitle = containsWord(title, needle);
      const inSnippet = !inTitle && containsWord(snippet, needle);
      if (inTitle || inSnippet) {
        matchedSkills.push(profileSkills[i]);
        overlapScore += inTitle ? 2 : 1;
      }
    }

    const recencyScore = listing.postedAt ? recencyWeight(listing.postedAt) : 0;

    return {
      id: listing.id,
      matchedSkills,
      score: overlapScore,
      recencyScore,
      sourceOrder: listing.sourceOrder,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.recencyScore !== a.recencyScore) return b.recencyScore - a.recencyScore;
    return a.sourceOrder - b.sourceOrder;
  });

  return ranked.map((r) => ({ id: r.id, matchedSkills: r.matchedSkills, score: r.score }));
}

function containsWord(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

/** More recent scores higher, decaying to 0 over 60 days. Never negative. */
function recencyWeight(postedAt: Date): number {
  const days = (Date.now() - postedAt.getTime()) / 86_400_000;
  return Math.max(0, 1 - days / 60);
}
