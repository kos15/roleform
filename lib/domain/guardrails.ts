/**
 * Learning-engine guardrails. PURE — every rule here is code, never a prompt.
 *
 * guardrails.md's opening rule: "a model told not to do something is a
 * suggestion; a validator is a rule." So the prompt in lib/ai/prompts does not
 * spend tokens asking the model to behave on anything this file can check, and
 * the checks run whether or not the model cooperated.
 *
 * The input guards are ordered by cost, cheapest first, so an expensive check
 * never runs on input a free check would have rejected.
 *
 * What lives here: the pure half — string work, pattern scans, span checks.
 * What does not: OUT-1's "does this resource id exist in the database", which
 * needs a query and therefore lives in lib/learning/validate.ts, a layer up.
 */

/* ----------------------------------------------------------- IN-1 · size caps */

/**
 * The JD size band (G5). One constant, read by both the action that first
 * sees the pasted or uploaded text (`createAnalysis`) and the AI call that
 * truncates it (`analyzeJd`) — before this they disagreed (120 char floor,
 * 24,000 char ceiling) with what guardrails.md IN-1 actually specifies (200,
 * 20,000), so the action accepted postings the model call would then still
 * have to truncate on every run.
 */
export const JD_MIN_CHARS = 200;
export const JD_MAX_CHARS = 20_000;

/* ------------------------------------------------------- IN-4 · PII redaction */

/**
 * Strip contact PII before résumé text reaches any model.
 *
 * None of these fields affect skill extraction, so redaction costs nothing in
 * quality and removes the data from every downstream log, cache and provider
 * request (guardrails.md IN-4, and N7 in the project contract).
 *
 * ── Scope note ──────────────────────────────────────────────────────────────
 * This runs on the learning path — the bullet text handed to the synthesiser.
 * It deliberately does NOT run on lib/ai/extract-profile.ts: that call's entire
 * job is to transcribe the résumé into JSON Resume, including `basics.email`
 * and `basics.phone`, and redacting its input would break the feature rather
 * than protect anyone. The résumé's contact block reaches a provider exactly
 * once, at onboarding, and never again.
 *
 * Names are retained — they appear in project attributions — per IN-4.
 */
export function redactPii(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g, "[EMAIL]")
    .replace(/\bhttps?:\/\/\S*\.(?:png|jpe?g|gif|webp|avif)\b/gi, "[PHOTO]")
    // Phone numbers: 7+ digits with the usual separators, optionally +country.
    .replace(/(?<![\w/])\+?\d[\d\s().-]{6,}\d(?![\w/])/g, (match) =>
      digitCount(match) >= 7 ? "[PHONE]" : match,
    )
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ID]")
    .replace(
      // The trailing sentence period is deliberately NOT consumed — eating it
      // merges two sentences of a bullet into one and changes how the text
      // reads to the model that receives it.
      /\b\d{1,5}\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way)\b/g,
      "[ADDRESS]",
    )
    .replace(/\b(?:DOB|Date of Birth)\b\s*[:\-]?\s*\S+/gi, "DOB: [DATE]");
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/* ------------------------------------------------- IN-5 · prompt injection scan */

/**
 * Job descriptions are untrusted third-party content, not user instruction —
 * anyone can post to a job board.
 *
 * This scanner is the second of three defences and the weakest of them. The
 * first is structural (the JD travels inside a delimited block the system
 * prompt names as data). The third is output containment, and it is the real
 * one: the synthesiser returns resource IDs, the serialiser looks the URLs up
 * in our own database, and an injected instruction cannot conjure an ID that
 * exists. Assume injection gets past this function; it is designed not to
 * matter (guardrails.md IN-5).
 *
 * A flagged run still proceeds. It is logged, and it gets the strict output
 * validation every run gets anyway.
 */
const INJECTION_PATTERNS: Array<{ name: string; test: RegExp }> = [
  { name: "override", test: /\b(ignore|disregard|forget)\b[^.\n]{0,30}\b(previous|prior|above|earlier)\b/i },
  { name: "role_marker", test: /^\s*(system|assistant|user)\s*:/im },
  { name: "reassignment", test: /\byou are now\b|\bnew instructions?\b|\bact as\b/i },
  { name: "exfiltration", test: /\b(reveal|print|output|repeat)\b[^.\n]{0,30}\b(system prompt|instructions)\b/i },
  { name: "zero_width", test: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/ },
  { name: "base64_blob", test: /\b[A-Za-z0-9+/]{120,}={0,2}\b/ },
];

export interface InjectionScan {
  flagged: boolean;
  /** Pattern names only — never the matched text, which is JD content (N7). */
  patterns: string[];
}

export function scanForInjection(text: string): InjectionScan {
  const patterns = INJECTION_PATTERNS.filter((p) => p.test.test(text)).map((p) => p.name);
  return { flagged: patterns.length > 0, patterns };
}

/* --------------------------------------- IN-6 · protected-attribute firewall */

/**
 * Requirements that touch a protected characteristic never become gaps.
 *
 * Two halves, both mandatory:
 *
 * 1. A discriminatory requirement in the posting is excluded from the analysis
 *    and flagged to the user once, neutrally. We do not propagate it into a
 *    gap, a narrative, or a course recommendation.
 * 2. We never recommend learning aimed at a protected attribute — accent
 *    reduction, age-appearance, and the rest. The catalog contains no such
 *    entry and this is the second lock (guardrails.md IN-6).
 *
 * The list is deliberately narrow and literal. A broad semantic filter here
 * would quietly drop legitimate requirements ("native mobile development",
 * "senior") and a false drop is invisible to the user.
 */
const PROTECTED_PATTERNS: Array<{ name: string; test: RegExp }> = [
  { name: "age", test: /\b(under|below|younger than)\s*\d{2}\b|\bage\s*(limit|below|under)\b|\bmax(imum)? age\b/i },
  { name: "nationality", test: /\bnative speakers? only\b|\b(only|must be)\s+(indian|american|british|european|citizens?)\b/i },
  { name: "gender", test: /\b(male|female|men|women)\s+(only|candidates? only|applicants? only)\b/i },
  { name: "marital", test: /\b(unmarried|single|married)\s+(candidates?|applicants?)\b/i },
  { name: "appearance", test: /\b(good[- ]looking|presentable appearance|smart looking)\b/i },
];

export interface ProtectedScan {
  /** True when the requirement must be excluded from the analysis entirely. */
  blocked: boolean;
  category: string | null;
}

export function scanProtected(text: string): ProtectedScan {
  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test.test(text)) return { blocked: true, category: pattern.name };
  }
  return { blocked: false, category: null };
}

/** The one neutral sentence the user sees when IN-6 fired. Never accusatory. */
export const PROTECTED_NOTICE =
  "This posting includes a requirement that may not be lawful in some jurisdictions — we've excluded it from your analysis.";

/* -------------------------------------------------------- OUT-4 · groundedness */

/**
 * Every gap's `why_it_matters` has to rest on something the posting actually
 * says. Ungrounded reasoning is where a model quietly invents a requirement the
 * employer never made, and the user then studies for it.
 *
 * The check is deliberately loose on wording and strict on existence: the model
 * may paraphrase, but the quote it was given must be a real span of the stored
 * requirement text. We verify the quote, not the sentence built around it.
 */
export function isGroundedQuote(quote: string, requirementText: string, evidenceQuote: string): boolean {
  const needle = squash(quote);
  if (needle.length < 8) return false;
  return squash(requirementText).includes(needle) || squash(evidenceQuote).includes(needle);
}

/* --------------------------------------------------------- OUT-2 · staged bullet */

/**
 * The staged bullet must be traceable to an existing résumé span, and must be
 * framed prospectively — "once you've built this, bullet 4 becomes…" — never as
 * a claim the candidate can make today.
 *
 * This is Roleform's product law (CLAUDE.md §3) applied to the Learning tab: the
 * engine never fabricates the bullet, it stages a bullet that becomes legitimate
 * AFTER the learning happens. A staged bullet with no source span is rejected
 * outright, no exceptions (guardrails.md OUT-2).
 */
const PRESENT_TENSE_CLAIMS = [
  /\byou (?:have|possess) (?:the )?experience\b/i,
  /\byour (?:experience|background) (?:includes|shows|demonstrates)\b/i,
  /\byou already\b/i,
  /\byou can (?:now )?claim\b/i,
];

const PROSPECTIVE_MARKERS =
  /\b(once|after|when)\b|\bwill (?:be able to|then)\b|\bbecomes\b|\bwould become\b|\byou'll be able\b/i;

export interface StagedBulletCheck {
  ok: boolean;
  reason: string | null;
}

export function checkStagedBullet(args: {
  draft: string;
  /** The verbatim text of the bullet this stages a rewrite of. */
  sourceBulletText: string | null;
}): StagedBulletCheck {
  if (!args.sourceBulletText) {
    return { ok: false, reason: "No source bullet — a staged rewrite must point at one the user wrote." };
  }
  if (args.draft.trim().length < 20) {
    return { ok: false, reason: "Staged bullet is too short to be a rewrite of anything." };
  }
  if (!PROSPECTIVE_MARKERS.test(args.draft)) {
    return { ok: false, reason: "Staged bullet is not phrased prospectively." };
  }
  for (const claim of PRESENT_TENSE_CLAIMS) {
    if (claim.test(args.draft)) {
      return { ok: false, reason: "Staged bullet reads as a claim the candidate can already make." };
    }
  }
  return { ok: true, reason: null };
}

/* ------------------------------------------------------------ OUT-6 · tone floor */

/**
 * The narrative lands on someone who is job-hunting. Never speculate about
 * rejection odds, never compare them to other candidates, never call a gap a
 * deficiency.
 *
 * guardrails.md OUT-6 says this is enforced by prompt and spot-checked in eval,
 * not by a classifier — a classifier here would reject honest prose and pass
 * dishonest prose. What IS worth a hard check is the small set of phrasings
 * that are always wrong on this surface, because each one is a specific promise
 * the product must not make.
 */
const TONE_VIOLATIONS: Array<{ name: string; test: RegExp }> = [
  { name: "odds", test: /\b\d{1,3}\s?%\s*(chance|likelihood|probability)\b|\bchances? of (?:an? )?(?:interview|offer|callback)\b/i },
  { name: "comparison", test: /\b(other|rival|competing) (?:candidates?|applicants?)\b|\bstand out from\b/i },
  { name: "deficiency", test: /\b(red flag|weakness|deficien\w+|shortcoming|unqualified)\b/i },
];

/**
 * `deficiency` is excluded on the Prep tab (GR-4): "What is your greatest
 * weakness?" is a real, ordinary interview question, and a worked answer
 * that names a weakness to then address it is the whole point of answering
 * one well. Odds and comparison stay banned everywhere prose is generated —
 * no surface in this product computes a candidate's chances or ranks them
 * against anyone.
 */
const PREP_TONE_VIOLATIONS = TONE_VIOLATIONS.filter((v) => v.name !== "deficiency");

export function scanTone(
  text: string,
  scope: "full" | "prep" = "full",
): { ok: boolean; violations: string[] } {
  const set = scope === "prep" ? PREP_TONE_VIOLATIONS : TONE_VIOLATIONS;
  const violations = set.filter((v) => v.test.test(text)).map((v) => v.name);
  return { ok: violations.length === 0, violations };
}

/* -------------------------------------------------------- COST · the ceiling */

/**
 * COST-2 — a hard per-run ceiling, enforced by an accumulator between stages
 * rather than discovered on the invoice.
 *
 * Roleform meters runs in tokens already (lib/domain/tokens.ts), so this is the
 * learning engine's own guard on top of that: exceeding it stops the run and
 * serves the best degraded payload available (agent.md §7 level 2 — gaps and
 * resources, no narrative), which is still genuinely useful.
 */
export const LEARNING_TOKEN_CEILING = 15_000;

export class TokenAccumulator {
  private used = 0;

  constructor(private readonly ceiling: number = LEARNING_TOKEN_CEILING) {}

  add(tokens: number): void {
    this.used += Math.max(0, tokens);
  }

  get total(): number {
    return this.used;
  }

  /** True when the next stage must be skipped rather than attempted. */
  exceeded(): boolean {
    return this.used >= this.ceiling;
  }

  /** agent.md §2: the Adjudicator is skipped past 70% of budget. */
  pastReserve(fraction = 0.7): boolean {
    return this.used >= this.ceiling * fraction;
  }
}

/* --------------------------------------------------------------- GR-3 · no URLs */

/**
 * GR-3 — no model-written string may contain a URL.
 *
 * Applied by every caller whose schema has a PROSE field a model writes
 * freely (rules.md GR-3): tailored bullets and summaries, interview
 * questions and frameworks, worked answers, the learning plan's narrative.
 * A model that wants to point somewhere has nowhere honest to put it — every
 * real link in this product is read from the curated catalog (N8) or a
 * provider's own field (JS-3), never typed by a model.
 *
 * Deliberately NOT applied to `extractProfile` (basics.url, profiles[].url,
 * certificates[].url, project.url are the point — the model is transcribing
 * URLs the user's own résumé states) or `analyzeJd` (`evidenceQuote` is a
 * verbatim span of the posting, separately checked against the source text;
 * a posting that names its own apply link is not a fabrication, and this
 * function would wrongly reject a correct verbatim quote for containing one).
 */
const URL_PATTERN = /\bhttps?:\/\/[^\s)>\]"'`]+/gi;

export function findUrls(value: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const matches = v.match(URL_PATTERN);
      if (matches) found.push(...matches);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return found;
}

export function noUrls(value: unknown): string | null {
  const urls = findUrls(value);
  if (urls.length === 0) return null;
  return `Remove the link(s) you wrote (${urls.join(", ")}). Never write a URL — every real link in this product comes from the curated catalog or a provider's own field, not from you.`;
}

/* --------------------------------------------------------------------- utils */

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
