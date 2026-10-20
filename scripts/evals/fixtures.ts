/**
 * Eval fixture contracts (agent design §6.8). Anonymised data only: no real
 * names, emails, employers or document text. Zod-checked so a malformed
 * fixture fails `--dry` before it costs a model call.
 */
import { z } from "zod";

export const BulletCase = z.object({
  id: z.string(),
  bullet: z.string().min(10),
  requirement: z.string().min(5),
  profileTerms: z.array(z.string()),
  /** "pass": an honest rewrite should survive. "flag": the posting demands what the bullet lacks. */
  expect: z.enum(["pass", "flag"]),
});

export const SummaryCase = z.object({
  id: z.string(),
  jobTitle: z.string(),
  bullets: z.array(z.string()).min(2),
  profileTerms: z.array(z.string()),
});

export const AnswerCase = z.object({
  id: z.string(),
  jobTitle: z.string(),
  question: z.object({ type: z.string(), text: z.string(), whyTheyAsk: z.string(), frame: z.array(z.string()).min(1) }),
  evidence: z.array(z.string()),
  other: z.array(z.string()),
  requirementText: z.string().nullable(),
});

export const PostingCase = z.object({ id: z.string(), text: z.string().min(200) });
export const ResumeCase = z.object({ id: z.string(), text: z.string().min(200) });

export const SETS = {
  "bullet-tailor": { adversarial: { schema: BulletCase, min: 30 }, honest: { schema: BulletCase, min: 30 } },
  "summary-tailor": { mixed: { schema: SummaryCase, min: 10 } },
  "answer-writer": { mixed: { schema: AnswerCase, min: 10 } },
  "posting-reader": { postings: { schema: PostingCase, min: 5 } },
  "profile-reader": { resumes: { schema: ResumeCase, min: 3 } },
} as const;

export type AgentKey = keyof typeof SETS;
