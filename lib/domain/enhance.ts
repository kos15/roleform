/**
 * Profile enhance (F34). PURE.
 *
 * N22 as amended: this is NOT a `QuotaKey`. The limit is identical on every
 * plan, so it is a named constant here, enforced at its seam by counting
 * `ai_runs` rows, stated on its own surface, and lifted for admins through
 * `withinCap` / `effectiveCap` like every cap.
 */

import type { EnhanceProposalOut } from "@/lib/ai/schemas/profile-enhance";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import { effectiveCap, withinCap } from "./entitlements";
import { checkFabrication, numbersIn } from "./fabrication";
import { findUrls } from "./guardrails";
import type { Role } from "./types";

export const ENHANCE_PURPOSE = "enhance_profile" as const;
/** Valid (schema-passing) runs a member may spend per window. */
export const ENHANCE_PER_DAY = 2;
/** Every attempt, valid or not, per window — a failed call still costs us. */
export const ENHANCE_ATTEMPTS_PER_DAY = 6;
export const ENHANCE_WINDOW_MS = 86_400_000;
export const ENHANCE_LIMIT_COPY = "2 every 24 hours, on every plan";

export const ENHANCE_MAX_FIELDS = 80;
export const ENHANCE_MAX_PROPOSALS = 40;
export const ENHANCE_REASON_MAX = 140;
export const ENHANCE_TEXT_MAX = 1_200;

export interface EnhanceRunRow {
  createdAt: Date;
  schemaValid: boolean;
}

export interface EnhanceAllowance {
  allowed: boolean;
  used: number;
  left: number;
  nextAt: Date | null;
  reason: "ok" | "used" | "attempts";
}

export type EnhanceBlock = "suspended" | "off";

export interface EnhanceView {
  left: number | null;
  nextAt: string | null;
  reason: EnhanceAllowance["reason"] | EnhanceBlock;
}

export function enhanceAllowance(args: {
  role: Role;
  rows: readonly EnhanceRunRow[];
  now: Date;
}): EnhanceAllowance {
  const { role, now } = args;
  const inWindow = args.rows
    .filter((r) => now.getTime() - r.createdAt.getTime() < ENHANCE_WINDOW_MS)
    .map((r) => ({ createdAt: r.createdAt, schemaValid: r.schemaValid }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const valid = inWindow.filter((r) => r.schemaValid);

  const used = valid.length;
  const attempts = inWindow.length;
  const okUsed = withinCap(role, ENHANCE_PER_DAY, used);
  const okAttempts = withinCap(role, ENHANCE_ATTEMPTS_PER_DAY, attempts);
  const allowed = okUsed && okAttempts;
  const left = Math.max(0, effectiveCap(role, ENHANCE_PER_DAY) - used);

  // Each exhausted constraint reopens when the row that tips it over ages out.
  const reopen = (sorted: readonly { createdAt: Date }[], cap: number): Date =>
    new Date(sorted[sorted.length - cap].createdAt.getTime() + ENHANCE_WINDOW_MS);
  const reopens: Date[] = [];
  if (!okUsed) reopens.push(reopen(valid, ENHANCE_PER_DAY));
  if (!okAttempts) reopens.push(reopen(inWindow, ENHANCE_ATTEMPTS_PER_DAY));
  const nextAt = reopens.length ? new Date(Math.max(...reopens.map((d) => d.getTime()))) : null;

  return {
    allowed,
    used,
    left,
    nextAt,
    reason: allowed ? "ok" : !okUsed ? "used" : "attempts",
  };
}

export function enhanceView(a: EnhanceAllowance, blocked: EnhanceBlock | null): EnhanceView {
  if (blocked) return { left: 0, nextAt: null, reason: blocked };
  return {
    left: Number.isFinite(a.left) ? a.left : null,
    nextAt: a.nextAt ? a.nextAt.toISOString() : null,
    reason: a.reason,
  };
}

/* ------------------------------------------------------- fields and filter */

export interface EnhanceField {
  path: string;
  text: string;
}

/** A suggested rephrase, tidy or removal of one profile field (§13). */
export interface ProfileProposal {
  path: string;
  kind: "rephrase" | "tidy" | "remove";
  before: string;
  after: string | null;
  reason: string;
}

const HIGHLIGHT_PATH = /^(work|projects|volunteer)\.\d+\.highlights\.\d+$/;

export function isHighlightPath(path: string): boolean {
  return HIGHLIGHT_PATH.test(path);
}

/**
 * The only text the model ever sees (N7): summaries, descriptions and bullets.
 * Never `basics` beyond `summary` — no name, contact, location or profiles.
 * Text carrying a URL is left out; the output guards would refuse it anyway.
 */
export function enhanceableFields(resume: StoredResume): EnhanceField[] {
  const out: EnhanceField[] = [];
  const add = (path: string, text: string | undefined) => {
    if (!text || !text.trim()) return;
    if (findUrls(text).length > 0) return;
    out.push({ path, text });
  };
  add("basics.summary", resume.basics.summary);
  resume.work.forEach((w, i) => {
    add(`work.${i}.summary`, w.summary);
    w.highlights.forEach((h, j) => add(`work.${i}.highlights.${j}`, h));
  });
  resume.projects.forEach((p, i) => {
    add(`projects.${i}.description`, p.description);
    p.highlights.forEach((h, j) => add(`projects.${i}.highlights.${j}`, h));
  });
  resume.volunteer.forEach((v, i) => {
    add(`volunteer.${i}.summary`, v.summary);
    v.highlights.forEach((h, j) => add(`volunteer.${i}.highlights.${j}`, h));
  });
  return out.slice(0, ENHANCE_MAX_FIELDS);
}

/** Tools the profile states — skill names and their keywords. */
export function enhanceProfileTerms(resume: StoredResume): string[] {
  return resume.skills.flatMap((s) => [s.name, ...s.keywords]).filter((t) => t.trim().length > 0);
}

/** Every number in the source survives in the text (order and spacing aside). */
export function numbersPreserved(source: string, text: string): boolean {
  const kept = numbersIn(text.toLowerCase());
  return numbersIn(source.toLowerCase()).every((n) => kept.includes(n));
}

const CLAIM_WORDS = new Set([
  // number words
  ...("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
    "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety dozen dozens " +
    "hundred hundreds thousand thousands million millions billion billions").split(" "),
  // ownership, seniority and title words
  ...("led lead leading owned owner spearheaded architected architect managed manager headed head " +
    "directed director drove senior principal staff chief").split(" "),
  // scale words
  ...["global", "large-scale", "enterprise-wide", "company-wide", "worldwide", "millions"],
]);

/** One whitespace-separated token with edge punctuation and a possessive removed. */
function cleanToken(raw: string): string {
  return raw
    .replace(/^[^A-Za-z0-9+#]+|[^A-Za-z0-9+#]+$/g, "")
    .replace(/['’]s$/i, "");
}

function tokensOf(text: string): string[] {
  return text.split(/\s+/).map(cleanToken).filter(Boolean);
}

/**
 * Enhance-only claim guard (§3): true when `after` states something the
 * ORIGINAL field does not — a proper noun or tool neither the source nor the
 * profile names, a number word, an ownership/seniority/title word, or a scale
 * word. Words compare whole (never as substrings); a hyphen compound that
 * contains a listed word must appear whole in the source ("co-led" stays,
 * "led" does not appear from it). Deliberately blunt; a false positive costs
 * one withheld suggestion. `checkFabrication` is untouched because tailoring
 * has its own tolerances.
 */
export function addsClaim(source: string, after: string, profileTerms: readonly string[]): boolean {
  const srcTokens = new Set(tokensOf(source.toLowerCase()));
  const known = new Set<string>();
  for (const text of [source, ...profileTerms]) {
    for (const t of tokensOf(text.toLowerCase())) {
      known.add(t);
      for (const part of t.split("-")) if (part) known.add(part);
    }
  }

  let sentenceStart = true;
  for (const raw of after.split(/\s+/).filter(Boolean)) {
    const atStart = sentenceStart;
    sentenceStart = /[.!?]["')\]]*$/.test(raw);
    const token = cleanToken(raw);
    if (!token) continue;

    const lower = token.toLowerCase();
    const parts = lower.split("-");
    if ((CLAIM_WORDS.has(lower) || parts.some((p) => CLAIM_WORDS.has(p))) && !srcTokens.has(lower)) {
      return true;
    }

    const caps = token.split("-");
    for (let i = 0; i < caps.length; i++) {
      const part = cleanToken(caps[i]);
      if (!part || (i === 0 && atStart) || part === "I" || !/^[A-Z]/.test(part)) continue;
      if (!known.has(part.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * The deterministic lock on the model's proposals (§3). An edit survives only
 * if it changes something, passes `checkFabrication` against the ORIGINAL text,
 * and keeps every number. A removal survives only on a highlight with no number.
 * First proposal per path wins; everything else is counted as dropped.
 */
export function filterProposals(
  fields: readonly EnhanceField[],
  proposals: readonly EnhanceProposalOut[],
  profileTerms: readonly string[],
): { kept: ProfileProposal[]; dropped: number } {
  const source = new Map(fields.map((f) => [f.path, f.text]));
  const seen = new Set<string>();
  const kept: ProfileProposal[] = [];

  for (const p of proposals) {
    const before = source.get(p.path);
    if (before === undefined || seen.has(p.path)) continue;
    seen.add(p.path);

    if (p.kind === "remove") {
      if (!isHighlightPath(p.path)) continue;
      if (numbersIn(before.toLowerCase()).length > 0) continue;
      kept.push({ path: p.path, kind: "remove", before, after: null, reason: p.reason });
      continue;
    }

    const after = p.text.trim();
    if (after === before.trim()) continue;
    if (checkFabrication({ source: before, rewritten: after, profileTerms: [...profileTerms] }).length > 0) continue;
    if (!numbersPreserved(before, after)) continue;
    if (findUrls(after).length > 0) continue;
    if (addsClaim(before, after, profileTerms)) continue;
    kept.push({ path: p.path, kind: p.kind, before, after, reason: p.reason });
  }

  return { kept, dropped: proposals.length - kept.length };
}

/** Deterministic: a skill listed twice (case and space aside) loses the later copy. */
export function duplicateSkillProposals(resume: StoredResume): ProfileProposal[] {
  const first = new Map<string, string>();
  const out: ProfileProposal[] = [];
  resume.skills.forEach((s, i) => {
    const key = s.name.trim().toLowerCase();
    const earlier = first.get(key);
    if (earlier === undefined) {
      first.set(key, s.name);
      return;
    }
    out.push({
      path: `skills.${i}`,
      kind: "remove",
      before: s.name,
      after: null,
      reason: `Listed twice — same as "${earlier}".`,
    });
  });
  return out;
}

/* ------------------------------------------------------ questions and apply */

export const ENHANCE_MAX_QUESTIONS = 8;
export const ENHANCE_ANSWER_MAX = 1_000;

export type QuestionTarget =
  | { kind: "set"; path: string }
  | { kind: "append"; path: string; owner: string };

/** A deterministic question; its answer goes in verbatim, with no model call. */
export interface ProfileQuestion {
  id: string;
  prompt: string;
  hint: string;
  input: "text" | "date";
  target: QuestionTarget;
}

export interface AnsweredQuestion {
  question: ProfileQuestion;
  answer: string;
}

const DATE_HINT = "YYYY or YYYY-MM.";

export function profileQuestions(resume: StoredResume): ProfileQuestion[] {
  const qs: ProfileQuestion[] = [];

  if (!resume.basics.summary.trim()) {
    qs.push({
      id: "summary",
      prompt: "In two or three sentences: what do you do, and what are you best at?",
      hint: "Goes in as your summary, exactly as you type it.",
      input: "text",
      target: { kind: "set", path: "basics.summary" },
    });
  }

  resume.work.forEach((w, i) => {
    const owner = `${w.position} · ${w.name}`;
    const target: QuestionTarget = { kind: "append", path: `work.${i}.highlights`, owner };
    if (w.highlights.length === 0) {
      qs.push({
        id: `work.${i}.first`,
        prompt: `What did you achieve as ${w.position} at ${w.name}?`,
        hint: "One result, in your words. Added as a bullet under this role.",
        input: "text",
        target,
      });
    } else if (!w.highlights.some((h) => /\d/.test(h))) {
      qs.push({
        id: `work.${i}.number`,
        prompt: `What changed because of your work as ${w.position} at ${w.name}?`,
        hint: "A number you can stand behind — users, time saved, money, team size. Skip it if you don't have one. Added as a new bullet.",
        input: "text",
        target,
      });
    }
  });

  resume.projects.forEach((p, i) => {
    if (p.highlights.length === 0) {
      qs.push({
        id: `projects.${i}.first`,
        prompt: `What did you build in ${p.name}, and what came of it?`,
        hint: "Added as a bullet under this project.",
        input: "text",
        target: { kind: "append", path: `projects.${i}.highlights`, owner: p.name },
      });
    }
  });

  resume.education.forEach((e, i) => {
    if (e.endDate === null) {
      qs.push({
        id: `education.${i}.endDate`,
        prompt: `When did you finish at ${e.institution}?`,
        hint: DATE_HINT,
        input: "date",
        target: { kind: "set", path: `education.${i}.endDate` },
      });
    }
  });

  resume.projects.forEach((p, i) => {
    if (p.startDate === null) {
      qs.push({
        id: `projects.${i}.startDate`,
        prompt: `When did you start ${p.name}?`,
        hint: DATE_HINT,
        input: "date",
        target: { kind: "set", path: `projects.${i}.startDate` },
      });
    }
  });

  resume.certificates.forEach((c, i) => {
    if (c.date === null) {
      qs.push({
        id: `certificates.${i}.date`,
        prompt: `When was ${c.name} issued?`,
        hint: DATE_HINT,
        input: "date",
        target: { kind: "set", path: `certificates.${i}.date` },
      });
    }
  });

  return qs.slice(0, ENHANCE_MAX_QUESTIONS);
}

/** Paths ticked by default: only tidy. Rephrase and remove start unticked. */
export function preselected(proposals: readonly ProfileProposal[]): string[] {
  return proposals.filter((p) => p.kind === "tidy").map((p) => p.path);
}

const EDIT_PATH =
  /^(basics\.summary|(work|volunteer)\.\d+\.summary|projects\.\d+\.description|(work|projects|volunteer)\.\d+\.highlights\.\d+)$/;
const SKILL_PATH = /^skills\.\d+$/;
const SET_PATH =
  /^(basics\.summary|education\.\d+\.endDate|projects\.\d+\.startDate|certificates\.\d+\.date)$/;
const APPEND_PATH = /^(work|projects|volunteer)\.\d+\.highlights$/;
const DATE_ANSWER = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

type Node = Record<string, unknown>;

/** The object that holds the last segment of `path`, and that segment. */
function holder(root: unknown, path: string): { parent: Node; key: string } | null {
  const segs = path.split(".");
  let cur: unknown = root;
  for (const seg of segs.slice(0, -1)) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Node)[seg];
  }
  if (cur === null || typeof cur !== "object") return null;
  return { parent: cur as Node, key: segs[segs.length - 1] };
}

function ownerOf(resume: StoredResume, path: string): string | null {
  const [section, idx] = path.split(".");
  const i = Number(idx);
  if (section === "work") {
    const w = resume.work[i];
    return w ? `${w.position} · ${w.name}` : null;
  }
  if (section === "projects") return resume.projects[i]?.name ?? null;
  if (section === "volunteer") {
    const v = resume.volunteer[i];
    return v ? `${v.position} · ${v.organization}` : null;
  }
  return null;
}

/**
 * Applies the member's ticked proposals and typed answers to a COPY of the
 * profile (N3: the caller decides whether it is ever saved). Every write is
 * guarded by what the member saw: an edit or removal applies only if the field
 * still reads `before`; an answer only fills an empty field or an unchanged
 * owner. Anything that no longer matches is counted as skipped, never forced.
 */
export function applyProposals(
  resume: StoredResume,
  accepted: readonly ProfileProposal[],
  answers: readonly AnsweredQuestion[],
): { resume: StoredResume; applied: number; skipped: number } {
  const out = structuredClone(resume);
  let applied = 0;
  let skipped = 0;

  // 1. Edits — replace text in place; indices do not move.
  for (const p of accepted) {
    if (p.kind === "remove") continue;
    const h = EDIT_PATH.test(p.path) ? holder(out, p.path) : null;
    if (!h || p.after === null || h.parent[h.key] !== p.before) {
      skipped++;
      continue;
    }
    h.parent[h.key] = p.after;
    applied++;
  }

  // 2. Answers — verbatim, trimmed, and only where nothing has taken the place.
  for (const { question, answer } of answers) {
    const text = answer.trim();
    if (!text) continue;
    if (text.length > ENHANCE_ANSWER_MAX) {
      skipped++;
      continue;
    }
    if (question.input === "date" && !DATE_ANSWER.test(text)) {
      skipped++;
      continue;
    }
    const t = question.target;
    if (t.kind === "set") {
      const h = SET_PATH.test(t.path) ? holder(out, t.path) : null;
      const cur = h?.parent[h.key];
      if (!h || (cur !== "" && cur !== null)) {
        skipped++;
        continue;
      }
      h.parent[h.key] = text;
      applied++;
    } else {
      const h = APPEND_PATH.test(t.path) ? holder(out, t.path) : null;
      const list = h?.parent[h.key];
      if (!h || !Array.isArray(list) || ownerOf(out, t.path) !== t.owner) {
        skipped++;
        continue;
      }
      list.push(text);
      applied++;
    }
  }

  // 3. Removals — validate all first, then filter each array by ORIGINAL index.
  const removals = new Map<string, Set<number>>();
  for (const p of accepted) {
    if (p.kind !== "remove") continue;
    const isHighlight = isHighlightPath(p.path);
    if (!isHighlight && !SKILL_PATH.test(p.path)) {
      skipped++;
      continue;
    }
    const h = holder(out, p.path);
    const item = h?.parent[h.key];
    const current = isHighlight ? item : (item as { name?: unknown } | undefined)?.name;
    if (!h || current !== p.before) {
      skipped++;
      continue;
    }
    const arrayPath = p.path.slice(0, p.path.lastIndexOf("."));
    const set = removals.get(arrayPath) ?? new Set<number>();
    if (set.has(Number(h.key))) continue;
    set.add(Number(h.key));
    removals.set(arrayPath, set);
    applied++;
  }

  for (const [arrayPath, indices] of removals) {
    const h = holder(out, arrayPath);
    const list = h?.parent[h.key];
    if (!h || !Array.isArray(list)) continue;
    h.parent[h.key] = list.filter((_, i) => !indices.has(i));

    // Re-key the bullet ids under this prefix: drop removed, shift the rest down.
    const ids = out.x_roleform?.bulletIds;
    if (ids && isHighlightPath(`${arrayPath}.0`)) {
      const prefix = `${arrayPath}.`;
      const next: Record<string, string> = {};
      for (const [key, id] of Object.entries(ids)) {
        if (!key.startsWith(prefix)) continue;
        delete ids[key];
        const j = Number(key.slice(prefix.length));
        if (!Number.isInteger(j) || indices.has(j)) continue;
        let shift = 0;
        for (const r of indices) if (r < j) shift++;
        next[`${prefix}${j - shift}`] = id;
      }
      Object.assign(ids, next);
    }
  }

  return { resume: out, applied, skipped };
}
