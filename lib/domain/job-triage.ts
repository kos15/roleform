/**
 * Job triage (F22.1, R18–R24, R30). PURE. No model call (N13).
 *
 * The reference workflow ranks postings by asking a model for four 0–100
 * scores. Roleform can't do that twice over: N13 keeps the model out of job
 * search, and N20 keeps a fit number off the page. What survives is the part
 * of that ranking that was ever honest — the named facts underneath it:
 *
 *   - which of the member's own skills a listing names, and which skills it
 *     asks for that the profile doesn't hold;
 *   - whether its title lines up with a title the member stated or held;
 *   - where it is against where the member said they want to work;
 *   - the posting's own stated minimum years against the profile's dates;
 *   - how old it is, and how the board says it's being distributed.
 *
 * Facts sort listings into four tiers — Shortlist, Worth a look, Long shot,
 * Ruled out — and every card carries the facts that put it there. Nothing in
 * this file produces a number for display, and nothing it returns is stored:
 * the triage is recomputed on every read, from rows and the profile, so the
 * same inputs always give the same page.
 */
import { canonicalSkill, normaliseSkill, skillsIn } from "@/lib/catalog/skills";
import type { ProfileFacts } from "./job-query";
import { jobKey, normaliseTitle } from "./job-key";

export interface TriageInput {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  /** The full description when the provider gave one, else the snippet. */
  text: string;
  /** The provider's own skill tags (freehire). Empty for other sources. */
  skills: string[];
  workMode: string | null;
  minYears: number | null;
  postedAt: Date | null;
  repostCount: number | null;
  massPostingCount: number | null;
  /** Position in the stored hit order — the last tie-breaker. */
  order: number;
}

export type Tier = "shortlist" | "consider" | "long_shot" | "ruled_out";

export const TIER_ORDER: Tier[] = ["shortlist", "consider", "long_shot", "ruled_out"];

export const TIER_LABEL: Record<Tier, string> = {
  shortlist: "Shortlist",
  consider: "Worth a look",
  long_shot: "Long shot",
  ruled_out: "Ruled out",
};

export type LocationVerdict = "pass" | "flag" | "fail" | "unchecked";

export interface Triage {
  tier: Tier;
  /** Profile skill names (as the member wrote them) the listing names. */
  matchedSkills: string[];
  /** Canonical skills the listing asks for that the profile doesn't hold. */
  askedSkills: string[];
  /** The member's own title this listing lines up with, if any. */
  titleMatch: string | null;
  location: { verdict: LocationVerdict; reason: string };
  /** Short, factual, already worded for the card. */
  strengths: string[];
  cautions: string[];
  ageDays: number | null;
}

export interface TriagedListing<T extends TriageInput = TriageInput> {
  listing: T;
  triage: Triage;
  /** Other places the same posting (same job key) was listed. */
  alsoIn: string[];
  /** Other sources that carried the same posting. */
  alsoVia: string[];
}

const DAY = 86_400_000;
const STALE_DAYS = 30;
const FRESH_DAYS = 3;

// ------------------------------------------------------------------ skills

function canonicalSet(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const name of names) {
    const canonical = canonicalSkill(name);
    out.add(canonical ?? normaliseSkill(name));
  }
  return out;
}

/** Every canonical skill a listing names: its own tags plus what its text says. */
function listingSkills(listing: TriageInput): Set<string> {
  const out = new Set<string>();
  for (const tag of listing.skills) {
    const canonical = canonicalSkill(tag);
    if (canonical) out.add(canonical);
  }
  for (const found of skillsIn(`${listing.title}\n${listing.text}`)) out.add(found);
  return out;
}

function containsWord(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`, "i").test(haystack);
}

function skillFacts(listing: TriageInput, profile: ProfileFacts) {
  const named = listingSkills(listing);
  const haystack = `${listing.title}\n${listing.text}`.toLowerCase();
  const profileCanon = canonicalSet(profile.skills);

  const matched: string[] = [];
  for (const skill of profile.skills) {
    const canonical = canonicalSkill(skill);
    // A canonical skill matches through the alias table; a skill the canon
    // doesn't know matches only on its own words, never on a guess.
    if (canonical ? named.has(canonical) : containsWord(haystack, skill.toLowerCase())) {
      if (!matched.includes(skill)) matched.push(skill);
    }
  }
  const asked = [...named].filter((s) => !profileCanon.has(s)).sort();
  return { matched, asked };
}

// ------------------------------------------------------------------ titles

const SENIORITY_WORDS = new Set([
  "senior", "sr", "junior", "jr", "lead", "staff", "principal", "head", "chief",
  "associate", "intern", "trainee", "fresher", "entry", "level", "mid", "i", "ii", "iii", "iv", "1", "2", "3",
]);
const STOP_WORDS = new Set(["and", "of", "the", "for", "in", "at", "with", "a", "an", "to"]);

/** "Front-end developer" and "Frontend Engineer" are the same function (R9). */
function coreTokens(title: string): string[] {
  return normaliseTitle(title)
    .replace(/\bfront end\b/g, "frontend")
    .replace(/\bback end\b/g, "backend")
    .replace(/\bfull stack\b/g, "fullstack")
    .replace(/\bdevops\b/g, "devops")
    .split(" ")
    .map((t) => (t === "developer" || t === "programmer" || t === "dev" ? "engineer" : t))
    .filter((t) => t && !SENIORITY_WORDS.has(t) && !STOP_WORDS.has(t));
}

/**
 * Every core word of `wanted` appears in `listingTitle`: "React Engineer"
 * covers "Senior React Engineer (Payments)", never "Engineering Manager".
 * Shared by the triage and by the ATS board filter, so a board listing is
 * kept by exactly the rule that later says its title lines up.
 */
export function titleCovers(listingTitle: string, wanted: string): boolean {
  const core = coreTokens(wanted);
  if (core.length === 0) return false;
  const listingCore = new Set(coreTokens(listingTitle));
  return core.every((t) => listingCore.has(t));
}

function titleFact(listingTitle: string, profileTitles: string[]): string | null {
  for (const title of profileTitles) {
    if (titleCovers(listingTitle, title)) return title;
  }
  return null;
}

// ---------------------------------------------------------------- location

const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore"],
  bangalore: ["bengaluru"],
  gurugram: ["gurgaon"],
  gurgaon: ["gurugram"],
  mumbai: ["bombay", "navi mumbai"],
  chennai: ["madras"],
  kolkata: ["calcutta"],
  "new delhi": ["delhi"],
  delhi: ["new delhi", "ncr"],
  noida: ["ncr"],
};

/** A city and the other names boards list it under. Lowercase in, lowercase out. */
export function cityNames(city: string): string[] {
  const c = city.trim().toLowerCase();
  return c ? [c, ...(CITY_ALIASES[c] ?? [])] : [];
}

const COUNTRY_ONLY = new Set([
  "india", "in", "united states", "usa", "us", "united kingdom", "uk", "gb", "germany", "canada",
  "australia", "singapore", "netherlands", "ireland", "france", "spain", "remote",
]);

function isRemoteText(text: string): boolean {
  return /\b(remote|work from home|wfh|anywhere)\b/i.test(text);
}

function locationFact(listing: TriageInput, profile: ProfileFacts): Triage["location"] {
  const loc = listing.location.trim();
  const lower = loc.toLowerCase();
  const remote = listing.workMode === "remote" || isRemoteText(loc);

  if (remote) return { verdict: "pass", reason: "Remote" };
  if (profile.remoteOnly && listing.workMode === "onsite") {
    return { verdict: "fail", reason: "On-site — your profile says remote only" };
  }
  if (profile.remoteOnly && listing.workMode === "hybrid") {
    return { verdict: "flag", reason: "Hybrid — your profile says remote" };
  }
  if (profile.city) {
    const names = cityNames(profile.city);
    if (names.some((n) => lower.includes(n))) {
      return { verdict: "pass", reason: listing.workMode === "hybrid" ? `Hybrid, ${loc}` : loc };
    }
  }
  if (profile.remoteOnly) return { verdict: "flag", reason: "Not stated as remote" };
  if (!loc) return { verdict: "flag", reason: "No location given" };
  if (!profile.city) return { verdict: "unchecked", reason: loc };
  if (COUNTRY_ONLY.has(lower.replace(/[^a-z ]/g, "").trim())) {
    return { verdict: "flag", reason: `Only says “${loc}” — check where` };
  }
  return { verdict: "flag", reason: `${loc} — outside your city` };
}

// --------------------------------------------------------------- seniority

/**
 * "3+ years of experience", "5-8 yrs relevant experience", "experience: 4+
 * years" — the first minimum stated *about experience*. A bare "10 years"
 * ("founded 10 years ago") is not read as a requirement.
 */
export function statedMinYears(text: string): number | null {
  const m =
    text.match(
      /\b(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:years?|yrs?)(?:'s?)?\s+(?:of\s+)?(?:[a-z.-]+\s+){0,4}?(?:experience|exp)\b/i,
    ) ?? text.match(/\bexperience\s*(?:of|:|-)?\s*(?:at least\s+|minimum\s+)?(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:years?|yrs?)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 20 ? n : null;
}

/** A worded caution, plus how many years short the profile is, when that's the reason. */
function seniorityFact(listing: TriageInput, profile: ProfileFacts): { text: string; yearsShort: number } | null {
  if (profile.years === null) return null;
  const min = listing.minYears ?? statedMinYears(listing.text);
  if (min !== null && min - profile.years >= 2) {
    return { text: `Asks for ${min}+ years; your profile shows ${profile.years}`, yearsShort: min - profile.years };
  }
  const title = listing.title.toLowerCase();
  if (profile.years < 3 && /\b(senior|sr\.?|lead|staff|principal|head of)\b/.test(title)) {
    return {
      text: `Senior-titled; your profile shows ${profile.years} year${profile.years === 1 ? "" : "s"}`,
      yearsShort: 0,
    };
  }
  if (profile.years >= 6 && /\b(intern|internship|junior|jr\.?|trainee|fresher|entry[- ]level)\b/.test(title)) {
    return { text: `Junior-titled; your profile shows ${profile.years} years`, yearsShort: 0 };
  }
  return null;
}

// ------------------------------------------------------------------ triage

function ageInDays(postedAt: Date | null, now: Date): number | null {
  if (!postedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - postedAt.getTime()) / DAY));
}

export function triageListing(listing: TriageInput, profile: ProfileFacts, now: Date = new Date()): Triage {
  const { matched, asked } = skillFacts(listing, profile);
  const titleMatch = titleFact(listing.title, profile.titles);
  const location = locationFact(listing, profile);
  const seniority = seniorityFact(listing, profile);
  const ageDays = ageInDays(listing.postedAt, now);

  const strengths: string[] = [];
  const cautions: string[] = [];

  if (titleMatch) strengths.push(`Title lines up with your “${titleMatch}”`);
  if (matched.length > 0) {
    strengths.push(`Names ${matched.length} of your skills`);
  }
  if (location.verdict === "pass") strengths.push(location.reason);
  if (ageDays !== null && ageDays <= FRESH_DAYS) {
    strengths.push(ageDays === 0 ? "Posted today" : `Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);
  }

  if (location.verdict === "flag" || location.verdict === "fail") cautions.push(location.reason);
  if (seniority) cautions.push(seniority.text);
  if (ageDays !== null && ageDays > STALE_DAYS) {
    cautions.push(`Posted ${ageDays} days ago — may already be filled`);
  }
  if (asked.length >= 5 && asked.length > matched.length) {
    cautions.push(`Asks for ${asked.length} skills not on your profile`);
  }
  if ((listing.massPostingCount ?? 0) > 1) {
    cautions.push(`The board has seen this posted ${listing.massPostingCount} times across places`);
  } else if ((listing.repostCount ?? 0) > 1) {
    cautions.push(`Re-listed ${listing.repostCount} times`);
  }

  const locationOk = location.verdict === "pass" || location.verdict === "unchecked";
  let tier: Tier;
  if (location.verdict === "fail") tier = "ruled_out";
  else if (titleMatch && matched.length >= 2 && locationOk && !seniority) tier = "shortlist";
  // Four or more years short of the posting's own stated minimum is a long
  // shot however well the title and skills line up — said, not hidden.
  else if ((seniority?.yearsShort ?? 0) >= 4) tier = "long_shot";
  else if (titleMatch || matched.length >= 2) tier = "consider";
  else tier = "long_shot";

  return { tier, matchedSkills: matched, askedSkills: asked, titleMatch, location, strengths, cautions, ageDays };
}

/**
 * Order inside a tier: a title that lines up first, then more of the
 * member's skills named, fewer skills they lack, newer, then stored order.
 * An internal comparator — never rendered, never stored.
 */
function compare(a: TriagedListing, b: TriagedListing): number {
  const tierDiff = TIER_ORDER.indexOf(a.triage.tier) - TIER_ORDER.indexOf(b.triage.tier);
  if (tierDiff !== 0) return tierDiff;
  const titleDiff = Number(Boolean(b.triage.titleMatch)) - Number(Boolean(a.triage.titleMatch));
  if (titleDiff !== 0) return titleDiff;
  const skillDiff = b.triage.matchedSkills.length - a.triage.matchedSkills.length;
  if (skillDiff !== 0) return skillDiff;
  const askedDiff = a.triage.askedSkills.length - b.triage.askedSkills.length;
  if (askedDiff !== 0) return askedDiff;
  const ageA = a.triage.ageDays ?? Number.MAX_SAFE_INTEGER;
  const ageB = b.triage.ageDays ?? Number.MAX_SAFE_INTEGER;
  if (ageA !== ageB) return ageA - ageB;
  return a.listing.order - b.listing.order;
}

/**
 * Same job key → one card (R14/R18). The listing kept is the first in stored
 * order that carries a full description (so Analyse gets the posting, not a
 * summary), else the first. The rest become "also in" places and "also via"
 * sources.
 */
export function consolidate<T extends TriageInput>(
  listings: T[],
): Array<{ listing: T; alsoIn: string[]; alsoVia: string[]; key: string }> {
  const groups = new Map<string, T[]>();
  for (const listing of [...listings].sort((a, b) => a.order - b.order)) {
    const key = jobKey(listing);
    const group = groups.get(key);
    if (group) group.push(listing);
    else groups.set(key, [listing]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const primary = group.find((l) => l.text.length > 600) ?? group[0];
    const rest = group.filter((l) => l !== primary);
    const primaryLoc = primary.location.trim().toLowerCase();
    const alsoIn = [
      ...new Set(
        rest.map((l) => l.location.trim()).filter((loc) => loc && loc.toLowerCase() !== primaryLoc),
      ),
    ];
    const alsoVia = [...new Set(rest.map((l) => l.source).filter((s) => s !== primary.source))];
    return { listing: primary, alsoIn, alsoVia, key };
  });
}

export function triageAll<T extends TriageInput>(
  listings: T[],
  profile: ProfileFacts,
  now: Date = new Date(),
): Array<TriagedListing<T> & { key: string }> {
  const triaged = consolidate(listings).map((group) => ({
    ...group,
    triage: triageListing(group.listing, profile, now),
  }));
  return triaged.sort((a, b) => compare(a, b));
}

export interface MarketGap {
  skill: string;
  /** How many of these listings ask for it. A count, not a rate (N16). */
  listings: number;
}

/**
 * Skills these listings keep asking for that the profile doesn't hold (R30).
 * Ruled-out listings don't vote; a skill one listing asks for is noise, so a
 * gap needs at least two.
 */
export function marketGaps(triaged: Array<{ triage: Triage }>, limit = 8): MarketGap[] {
  const counts = new Map<string, number>();
  for (const { triage } of triaged) {
    if (triage.tier === "ruled_out") continue;
    for (const skill of triage.askedSkills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([skill, listings]) => ({ skill, listings }));
}
