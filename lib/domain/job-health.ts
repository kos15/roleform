/**
 * Source health (F22.1, R28). PURE.
 *
 * A source behind an API can still rot quietly: a field gets renamed and
 * every company comes back blank, or the schema rejects every record and
 * the search "succeeds" with nothing in it. The reference catches this from
 * the evidence a run already holds before spending a single extra request;
 * so does this. No probe, no retry beyond the adapter's own — a diagnosis
 * from what came back, never a crawl.
 *
 * The report stores counts and status codes only (N7/JS-8): never a title,
 * a company, a city or a query term.
 */

export type SourceState = "ok" | "empty" | "degraded" | "failed" | "not_configured" | "disabled";

export type DegradedBecause = "no_company" | "markup" | "all_dropped" | "boards_failed";

export interface SourceReport {
  id: string;
  state: SourceState;
  /** Listings this source contributed after the window and dedupe. */
  listings: number;
  /** Records the schema refused (N18). */
  dropped: number;
  /** Records the provider marked closed (R17). */
  closed: number;
  /** Listings older than the requested window, dropped on our side (R11). */
  outOfWindow: number;
  /** Board-backed sources (F22.2): employer boards that didn't answer, of how many. */
  boardsFailed?: number;
  boardsTotal?: number;
  failureKind?: "timeout" | "network" | "http" | "body";
  httpStatus?: number;
  degradedBecause?: DegradedBecause[];
}

export interface HealthEvidence {
  received: number;
  dropped: number;
  companies: string[];
  titlesWithResidue: number;
  /** Employer boards that didn't answer (F22.2). 0 for single-endpoint sources. */
  boardsFailed?: number;
}

/**
 * ok / empty / degraded from what the source returned. `failed`,
 * `not_configured` and `disabled` are decided before this is ever called.
 */
export function assessHealth(e: HealthEvidence): { state: SourceState; degradedBecause?: DegradedBecause[] } {
  const reasons: DegradedBecause[] = [];
  if (e.received === 0 && e.dropped > 0) reasons.push("all_dropped");
  if (e.received >= 3 && e.companies.every((c) => !c.trim())) reasons.push("no_company");
  if (e.received >= 3 && e.titlesWithResidue / e.received > 0.5) reasons.push("markup");
  if ((e.boardsFailed ?? 0) > 0) reasons.push("boards_failed");
  if (reasons.length > 0) return { state: "degraded", degradedBecause: reasons };
  return { state: e.received === 0 ? "empty" : "ok" };
}

const FAILURE_WORDS: Record<NonNullable<SourceReport["failureKind"]>, string> = {
  timeout: "timed out",
  network: "couldn't be reached",
  http: "refused the request",
  body: "sent back something unreadable",
};

const DEGRADED_WORDS: Record<DegradedBecause, string> = {
  all_dropped: "every record failed our checks",
  no_company: "no listing carried a company name",
  markup: "titles came back with markup in them",
  boards_failed: "some employer boards didn't answer",
};

/** One plain sentence for the page. Null for a healthy source — healthy is silent (R28). */
export function describeHealth(report: SourceReport, label: string): string | null {
  switch (report.state) {
    case "ok":
      return null;
    case "empty":
      return `${label} had nothing for this search.`;
    case "failed": {
      const what = report.failureKind ? FAILURE_WORDS[report.failureKind] : "failed";
      const code = report.httpStatus ? ` (HTTP ${report.httpStatus})` : "";
      return `${label} ${what}${code} — its listings are missing from this search.`;
    }
    case "degraded": {
      const words = (report.degradedBecause ?? []).map((d) =>
        d === "boards_failed" && report.boardsTotal
          ? `${report.boardsFailed} of its ${report.boardsTotal} employer boards didn't answer`
          : DEGRADED_WORDS[d],
      );
      return `${label} looks unwell: ${words.join("; ")}.`;
    }
    case "not_configured":
      return `${label} isn't set up on this deployment.`;
    case "disabled":
      return `${label} is switched off on this deployment.`;
  }
}

/** Shape check for a stored `job_searches.source_report` read back from JSON. */
export function readReports(raw: unknown): SourceReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is SourceReport =>
      !!r && typeof r === "object" && typeof (r as SourceReport).id === "string" && typeof (r as SourceReport).state === "string",
  );
}
