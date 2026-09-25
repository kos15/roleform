/**
 * A described job search — "senior React developer in Pune, remote is fine" —
 * turned into a JobQuery. PURE, deterministic, no model call (N13).
 *
 * The description itself never leaves this server (N19). What comes out is
 * exactly the fields a JobQuery already allows: role titles, canonical skill
 * names from the catalog (`skillsIn`), a city and a remote flag. Anything the
 * parser can't place in one of those — names, emails, numbers, the rest of
 * the sentence — is dropped, not forwarded.
 */
import { skillsIn } from "@/lib/catalog/skills";

export const MAX_DESCRIPTION_CHARS = 500;
const MAX_TITLES = 3;
const MAX_KEYWORDS = 6;

export interface JobIntent {
  titles: string[];
  keywords: string[];
  location: string | null;
  remote: boolean;
}

/** The last word of a role title. A role phrase is up to three words before one of these. */
const ROLE_NOUNS = [
  "engineer",
  "developer",
  "dev",
  "programmer",
  "designer",
  "architect",
  "analyst",
  "scientist",
  "manager",
  "lead",
  "consultant",
  "administrator",
  "admin",
  "tester",
  "specialist",
  "intern",
  "researcher",
  "writer",
  "sre",
  "owner",
  "strategist",
  "marketer",
  "accountant",
  "executive",
  "associate",
];

/** Words that can sit before a role noun without being part of the title. */
const NOT_TITLE = new Set([
  "a", "an", "the", "as", "for", "of", "to", "and", "or", "i", "im", "i'm", "am", "want", "wants",
  "looking", "seeking", "need", "find", "me", "my", "job", "jobs", "role", "roles", "position",
  "positions", "opening", "openings", "work", "working", "like", "would", "some", "any", "with",
  "in", "at", "on", "is", "be", "become", "good", "new", "remote", "hybrid", "onsite", "fulltime",
  "full-time", "part-time", "parttime", "contract", "freelance", "paying", "well", "high",
]);

/** Cities are only taken after one of these words, so "Go developer" never becomes a location. */
const LOCATION_CUE = /\b(?:in|at|near|around|based in|located in|from)\s+([A-Za-z][A-Za-z .-]{1,40})/i;
const LOCATION_STOP =
  /\s+(?:or|and|with|for|as|remote|hybrid|onsite|using|who|that|where|preferably|please|,).*$/i;
const NOT_A_PLACE = new Set(["a", "an", "the", "my", "it", "this", "that", "remote", "hybrid", "office", "person"]);

const REMOTE = /\b(?:remote|remotely|work from home|wfh|anywhere)\b/i;

/** Contact details and links are scrubbed before any matching, so no rule below can ever pick one up. */
function scrub(text: string): string {
  return text
    .slice(0, MAX_DESCRIPTION_CHARS)
    .replace(/\S+@\S+/g, " ")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\b\S+\.(?:com|in|dev|io|org|net|co|me|ai)\b\S*/gi, " ")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ACRONYMS = new Set([
  "qa", "qe", "ui", "ux", "ml", "ai", "sre", "sde", "api", "hr", "it", "bi", "etl", "gis", "seo", "ar", "vr", "erp", "crm",
]);

function titleCase(words: string[]): string {
  return words
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w === "ios" ? "iOS" : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A title never spans a clause: commas, dashes and pipes end one. */
function findTitles(text: string): string[] {
  const titles: string[] = [];
  for (const clause of text.toLowerCase().split(/[,;|:()\u2013\u2014]+|\s-\s/)) {
    for (const title of titlesIn(clause.split(/\s+/).filter(Boolean))) {
      if (!titles.some((t) => t.toLowerCase() === title.toLowerCase())) titles.push(title);
      if (titles.length === MAX_TITLES) return titles;
    }
  }
  return titles;
}

/** A word that can be part of a title: letters, with +, # or . inside ("c++", "node.js"). */
const TITLE_WORD = /^[a-z][a-z0-9+#.-]*$/;

function titlesIn(raw: string[]): string[] {
  const words = raw.map((w) => w.replace(/[.!?]+$/, ""));
  const titles: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const noun = words[i].replace(/s$/, "");
    if (!ROLE_NOUNS.includes(noun)) continue;
    const phrase: string[] = [noun];
    for (let j = i - 1; j >= 0 && phrase.length < 4; j--) {
      if (NOT_TITLE.has(words[j]) || !TITLE_WORD.test(words[j])) break;
      phrase.unshift(words[j]);
    }
    // "lead" and "owner" only count as titles with something in front ("tech lead", "product owner").
    if (phrase.length === 1 && (noun === "lead" || noun === "owner" || noun === "associate")) continue;
    titles.push(titleCase(phrase));
  }
  return titles;
}

function findLocation(text: string): string | null {
  const match = LOCATION_CUE.exec(text);
  if (!match) return null;
  const place = match[1].replace(LOCATION_STOP, "").replace(/[.\s-]+$/, "").trim();
  if (!place || NOT_A_PLACE.has(place.toLowerCase())) return null;
  // A skill after "in" ("experience in React") is not a place.
  if (skillsIn(place).length > 0) return null;
  return place
    .split(/\s+/)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function parseJobIntent(description: string): JobIntent {
  const text = scrub(description);
  if (!text) return { titles: [], keywords: [], location: null, remote: false };

  const titles = findTitles(text);
  const inTitles = titles.join(" ").toLowerCase();
  // Skills already carried by a title ("React Developer") aren't repeated as keywords.
  const keywords = skillsIn(text)
    .filter((k) => !inTitles.includes(k.toLowerCase()))
    .slice(0, MAX_KEYWORDS);

  return { titles, keywords, location: findLocation(text), remote: REMOTE.test(text) };
}
