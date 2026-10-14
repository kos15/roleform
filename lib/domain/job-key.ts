/**
 * The canonical job key (F22.1, R14). PURE.
 *
 * One posting reaches us through several doors: freehire and an employer's
 * own board both list the same opening, and an employer posts one role in five cities.
 * The key is a pure function of company and title, so two searches can never
 * key the same posting differently. Location is left out on purpose: that is
 * what lets `consolidate` say "also posted in 4 other locations" instead of
 * showing five cards (R18).
 *
 * Not a hash: the key never leaves the server and never reaches a log
 * (logs carry counts only, N7), so legibility costs nothing.
 */

/** Words boards bolt onto one title that vary across copies of the same posting. */
const TITLE_NOISE = /\b(m\/f\/d|f\/m\/d|m\/w\/d|w\/m\/d|all genders|remote|hybrid|on-?site|urgent|hiring|immediate joiner|immediate)\b/g;

/** Legal suffixes the same employer is listed with and without (matched after `squash`). */
const COMPANY_SUFFIX =
  /\b(private limited|pvt ltd|pvt|ltd|limited|llc|inc|incorporated|corp|corporation|co|gmbh|ag|sa|plc|llp)\b/g;

function squash(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseCompany(company: string): string {
  return squash(squash(company).replace(COMPANY_SUFFIX, " "));
}

export function normaliseTitle(title: string): string {
  return squash(
    title
      .toLowerCase()
      // "(Remote)", "[Pune]", "– Bangalore" — bracketed and dashed tails are
      // where boards put the location, which the key deliberately ignores.
      .replace(/[([{][^)\]}]*[)\]}]/g, " ")
      .replace(/\s[-–—|]\s.*$/, " ")
      .replace(TITLE_NOISE, " "),
  );
}

/**
 * `company|title`. A listing with no company keys on its title alone plus
 * its own id, so two anonymous "Software Engineer" listings never merge into
 * one — collapsing them would be a claim we can't back.
 */
export function jobKey(listing: { company: string; title: string; id: string }): string {
  const company = normaliseCompany(listing.company);
  const title = normaliseTitle(listing.title);
  if (!company) return `?|${title}|${listing.id}`;
  return `${company}|${title}`;
}
