/**
 * The employer boards the Greenhouse, Lever and Ashby adapters read (F22.2).
 *
 * These APIs serve one company's own board each, never a cross-company
 * search, so the set of companies is curated, like the course catalog
 * (N8's shape): a board is here because someone checked it exists and lists
 * roles a member in our market could take. Every token below was checked
 * live on 2026-10-14 against its API and listed India-based or remote roles
 * that day. Boards that answered 404 were left out, not guessed at.
 *
 * OpenAI's Ashby board is deliberately absent: at ~13 MB per fetch it can't
 * be read inside one source's 8s budget.
 *
 * `JOBS_ATS_BOARDS` adds boards per deployment without a code change:
 * `greenhouse:acme,lever:widgets,ashby:example-co`. A token that 404s is
 * reported in the source's health line, never silently skipped.
 */
import "server-only";

export type Ats = "greenhouse" | "lever" | "ashby";

export interface Board {
  ats: Ats;
  token: string;
  /** Shown as the listing's company. Lever and Ashby send none of their own. */
  company: string;
  /**
   * True when `company` was checked by a person (the curated list). Greenhouse
   * boards name themselves, sometimes as "Rubrik Job Board"; a checked name
   * wins over that, and the board's own name wins over a capitalised token.
   */
  named: boolean;
}

const board = (ats: Ats) => ([token, company]: [string, string]): Board => ({ ats, token, company, named: true });

const CURATED: Board[] = [
  // Greenhouse — boards-api.greenhouse.io/v1/boards/{token}/jobs
  ...(
    [
      ["stripe", "Stripe"], ["airbnb", "Airbnb"], ["gitlab", "GitLab"], ["groww", "Groww"],
      ["databricks", "Databricks"], ["mongodb", "MongoDB"], ["coinbase", "Coinbase"], ["twilio", "Twilio"],
      ["dropbox", "Dropbox"], ["rubrik", "Rubrik"], ["druva", "Druva"], ["discord", "Discord"],
    ] as Array<[string, string]>
  ).map(board("greenhouse")),
  // Lever — api.lever.co/v0/postings/{token}?mode=json
  ...(
    [
      ["cred", "CRED"], ["zeta", "Zeta"], ["spotify", "Spotify"], ["meesho", "Meesho"],
      ["paytm", "Paytm"], ["mindtickle", "Mindtickle"],
    ] as Array<[string, string]>
  ).map(board("lever")),
  // Ashby — api.ashbyhq.com/posting-api/job-board/{token}
  ...(
    [
      ["notion", "Notion"], ["ramp", "Ramp"], ["linear", "Linear"], ["supabase", "Supabase"],
      ["posthog", "PostHog"], ["cohere", "Cohere"], ["replit", "Replit"], ["clickhouse", "ClickHouse"],
      ["sardine", "Sardine"], ["plane", "Plane"],
    ] as Array<[string, string]>
  ).map(board("ashby")),
];

function fromEnv(): Board[] {
  return (process.env.JOBS_ATS_BOARDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => {
      const [ats, token] = entry.split(":").map((s) => s.trim());
      if ((ats === "greenhouse" || ats === "lever" || ats === "ashby") && token && /^[a-z0-9-]{1,80}$/i.test(token)) {
        // An env-added board has no curated name; the token, capitalised, is
        // the honest fallback (Greenhouse overrides it with its own name).
        return { ats, token, company: token.charAt(0).toUpperCase() + token.slice(1), named: false } as Board;
      }
      return null;
    })
    .filter((b): b is Board => b !== null);
}

export function boardsFor(ats: Ats): Board[] {
  const seen = new Set<string>();
  return [...CURATED, ...fromEnv()].filter((b) => {
    if (b.ats !== ats || seen.has(b.token)) return false;
    seen.add(b.token);
    return true;
  });
}
