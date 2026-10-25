/**
 * Employer-board discovery for F22.2 — candidates for a person to curate.
 *
 * The Greenhouse, Lever and Ashby sources read a CURATED list of boards
 * (lib/jobs/sources/ats-boards.ts), because those APIs have no cross-company
 * search. Twenty-eight boards is the coverage ceiling of the whole product's
 * job search; this script is how that list grows.
 *
 *   1. DeepSeek Search, `site:`-restricted to the three vendors' hosted job
 *      pages, for each title × vendor. The query is a title, a country name
 *      and `site:` clauses — nothing from any member (N19).
 *   2. Only the result URL is read, and only to take the board token out of
 *      its first path segment. No page is fetched (N17).
 *   3. Every new token is checked against the vendor's own documented API —
 *      the same `spec` the live adapter uses — and its postings counted
 *      through `boardPostingFits`, the same filter a member's search runs.
 *
 * Nothing is written anywhere. The output is a table and a ready
 * `JOBS_ATS_BOARDS=` line; a person checks the company and adds the boards
 * to `CURATED` (with a real company name) or to that env var.
 *
 *   pnpm jobs:discover-boards                       default titles, India
 *   pnpm jobs:discover-boards "Data Engineer" "SRE" --place "Bengaluru, IN"
 *
 * Cost: one search per title × vendor ($0.75 per 1,000) — the defaults are 18.
 */
import "./env";
import { webSearch, describeFailure, deepseekConfigured, MAX_QUERY_CHARS } from "../lib/search/deepseek";
import { boardsFor, type Ats, type Board } from "../lib/jobs/sources/ats-boards";
import { cachedJson, type AtsAdapterSpec } from "../lib/jobs/sources/ats";
import { spec as greenhouseSpec } from "../lib/jobs/sources/greenhouse";
import { spec as leverSpec } from "../lib/jobs/sources/lever";
import { spec as ashbySpec } from "../lib/jobs/sources/ashby";
import { boardPostingFits } from "../lib/domain/board-filter";

const DEFAULT_TITLES = [
  "Software Engineer",
  "Backend Engineer",
  "Frontend Engineer",
  "Data Scientist",
  "Product Manager",
  "DevOps Engineer",
];
const RESULTS_PER_SEARCH = 30;
/** Verifying a board downloads it whole; this bounds one run. */
const MAX_CANDIDATES = 80;

/** Hosted job-page hosts per vendor. EU-region hosts are left out: their APIs live elsewhere. */
const HOSTS: Record<Ats, string[]> = {
  greenhouse: ["boards.greenhouse.io", "job-boards.greenhouse.io"],
  lever: ["jobs.lever.co"],
  ashby: ["jobs.ashbyhq.com"],
};

const SPECS: Record<Ats, AtsAdapterSpec> = { greenhouse: greenhouseSpec, lever: leverSpec, ashby: ashbySpec };

const TOKEN = /^[a-z0-9-]{1,80}$/;

/** The board token in a vendor's hosted job URL, or null. Reads the string only. */
function boardTokenFromUrl(ats: Ats, raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!HOSTS[ats].includes(url.hostname.toLowerCase())) return null;
  const first = url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  // Greenhouse's embed page names the board in `?for=`.
  const token = ats === "greenhouse" && first === "embed" ? (url.searchParams.get("for") ?? "").toLowerCase() : first;
  return TOKEN.test(token) ? token : null;
}

function parseArgs(argv: string[]): { titles: string[]; place: string } {
  const titles: string[] = [];
  let place = "India, IN";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--place") place = argv[++i] ?? place;
    else titles.push(argv[i]);
  }
  return { titles: titles.length > 0 ? titles : DEFAULT_TITLES, place };
}

interface Candidate {
  ats: Ats;
  token: string;
  /** The titles whose search surfaced this board. */
  via: Set<string>;
  siteName: string | null;
}

async function main() {
  if (!deepseekConfigured()) {
    console.error("DEEPSEEK_API_KEY is not set (.env.local). Nothing to do.");
    process.exit(1);
  }
  const { titles, place } = parseArgs(process.argv.slice(2));
  const placeWord = place.split(",")[0].trim();

  /* -------------------------------------------------------- 1. search */
  const known = new Set((["greenhouse", "lever", "ashby"] as Ats[]).flatMap((a) => boardsFor(a).map((b) => `${a}:${b.token}`)));
  const found = new Map<string, Candidate>();
  let searches = 0;

  for (const title of titles) {
    for (const ats of Object.keys(HOSTS) as Ats[]) {
      const query = `"${title}" ${placeWord} ${HOSTS[ats].map((h) => `site:${h}`).join(" OR ")}`;
      if ([...query].length > MAX_QUERY_CHARS) {
        console.warn(`  skip ${ats} × a title over the query limit`);
        continue;
      }
      const out = await webSearch(query, RESULTS_PER_SEARCH);
      searches++;
      if (!out.ok) {
        console.warn(`  ${ats}: search failed — ${describeFailure(out.error)}`);
        if (out.error.kind === "http" && (out.error.status === 401 || out.error.status === 402)) process.exit(1);
        continue;
      }
      for (const hit of out.hits) {
        const token = boardTokenFromUrl(ats, hit.url);
        if (!token || known.has(`${ats}:${token}`)) continue;
        const key = `${ats}:${token}`;
        const c = found.get(key) ?? { ats, token, via: new Set<string>(), siteName: hit.site_name };
        c.via.add(title);
        found.set(key, c);
      }
    }
  }

  const candidates = [...found.values()].sort((a, b) => b.via.size - a.via.size).slice(0, MAX_CANDIDATES);
  console.log(`\n${searches} searches · ${found.size} new boards seen · verifying ${candidates.length}\n`);

  /* -------------------------------------------- 2. verify via vendor API */
  const rows: Array<{ c: Candidate; postings: number; inPlace: number; remote: number; status: string }> = [];
  for (const c of candidates) {
    const spec = SPECS[c.ats];
    const board: Board = { ats: c.ats, token: c.token, company: c.token, named: false };
    const got = await cachedJson(spec.boardUrl(board));
    if ("failure" in got) {
      rows.push({ c, postings: 0, inPlace: 0, remote: 0, status: got.failure.httpStatus ? `HTTP ${got.failure.httpStatus}` : got.failure.kind });
      continue;
    }
    const postings = spec.toCandidates(board, got.body);
    const fits = (remote: boolean) =>
      postings.filter((p) => [...c.via].some((t) => boardPostingFits(p, t, { location: place, remote }))).length;
    rows.push({ c, postings: postings.length, inPlace: fits(false), remote: fits(true), status: "ok" });
  }

  /* ---------------------------------------------------------- 3. report */
  rows.sort((a, b) => b.inPlace + b.remote - (a.inPlace + a.remote));
  console.log("ats         token                          postings  fit-in-place  fit-remote  status");
  for (const r of rows) {
    console.log(
      `${r.c.ats.padEnd(11)} ${r.c.token.padEnd(30)} ${String(r.postings).padStart(8)}  ${String(r.inPlace).padStart(12)}  ${String(r.remote).padStart(10)}  ${r.status}`,
    );
  }

  const keep = rows.filter((r) => r.status === "ok" && r.inPlace + r.remote > 0);
  console.log(`\n${keep.length} boards answer their vendor API and list a fitting role in ${placeWord} or remote today.`);
  if (keep.length > 0) {
    console.log("Check each company, then add to CURATED in lib/jobs/sources/ats-boards.ts with its real name, or:\n");
    const existing = process.env.JOBS_ATS_BOARDS?.trim();
    const added = keep.map((r) => `${r.c.ats}:${r.c.token}`).join(",");
    console.log(`JOBS_ATS_BOARDS=${existing ? `${existing},${added}` : added}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "failed");
  process.exit(1);
});
