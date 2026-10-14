/**
 * Which postings on an employer's own job board belong in a search (F22.2). PURE.
 *
 * Greenhouse, Lever and Ashby have no keyword search: each serves one
 * company's whole board. So the "search" happens here, on our side, over
 * rows the employer published: the title must cover the keyword variant
 * (the same rule the triage uses to say a title lines up), and the place
 * must be one the member could take — their city, their country, or remote
 * when they asked for remote.
 */
import type { JobQuery } from "./job-query";
import { cityNames, titleCovers } from "./job-triage";

/** ISO code → the names a board writes. Only codes we can honestly name. */
const COUNTRY_NAMES: Record<string, string[]> = {
  in: ["india"],
  us: ["united states", "usa", "u.s."],
  gb: ["united kingdom", "uk", "england", "london"],
  de: ["germany", "deutschland"],
  ca: ["canada"],
  au: ["australia"],
  sg: ["singapore"],
  ie: ["ireland"],
  nl: ["netherlands"],
  fr: ["france"],
  ae: ["united arab emirates", "uae", "dubai"],
};

const ANYWHERE = /\b(anywhere|worldwide|global|international)\b/i;

export interface BoardPosting {
  title: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite" | null;
  /** ISO code the board itself states (Lever), lowercase; null when it doesn't. */
  countryCode: string | null;
}

function placeOf(query: Pick<JobQuery, "location">): { cities: string[]; countries: string[] } {
  const parts = query.location.split(",").map((p) => p.trim()).filter(Boolean);
  const code = parts.length > 1 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1]) ? parts.pop()!.toLowerCase() : null;
  const cities = parts.length > 0 ? cityNames(parts[0]) : [];
  const countries = code ? [code, ...(COUNTRY_NAMES[code] ?? [])] : [];
  return { cities, countries };
}

export function boardPostingFits(
  posting: BoardPosting,
  keywords: string,
  query: Pick<JobQuery, "location" | "remote">,
): boolean {
  if (!titleCovers(posting.title, keywords)) return false;

  const loc = posting.location.toLowerCase();
  const remote = posting.workMode === "remote" || /\bremote\b/i.test(loc);
  const { cities, countries } = placeOf(query);
  const inCountry =
    (posting.countryCode !== null && countries.includes(posting.countryCode)) ||
    countries.slice(1).some((name) => loc.includes(name));

  if (query.remote) {
    // Remote, and somewhere the member can work from: their country, or a
    // board that says anywhere. A "Remote — US" role is not remote for them.
    return remote && (countries.length === 0 || inCountry || ANYWHERE.test(loc));
  }
  if (cities.length === 0 && countries.length === 0) return true;
  if (cities.some((c) => loc.includes(c))) return true;
  if (inCountry) return true;
  return remote && ANYWHERE.test(loc);
}
