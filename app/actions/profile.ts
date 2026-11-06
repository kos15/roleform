"use server";

import { requireUser, checkEnhanceAllowance, readEnhanceAllowance } from "@/lib/services/auth";
import { requireFeature } from "@/lib/services/features";
import { LIMITS, rateLimit } from "@/lib/services/rate-limit";
import { getProfile } from "@/lib/db/queries/profile";
import { StoredResumeSchema } from "@/lib/ai/schemas/resume-json";
import { enhanceProfile as enhanceProfileAi } from "@/lib/ai/services/enhance-profile";
import {
  duplicateSkillProposals,
  enhanceProfileTerms,
  enhanceView,
  enhanceableFields,
  filterProposals,
  profileQuestions,
  type EnhanceView,
  type ProfileProposal,
  type ProfileQuestion,
} from "@/lib/domain/enhance";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * F34 — Enhance profile. One fast model call over the member's content fields,
 * filtered deterministically, returned for review. N22 as amended: the 2-per-24h
 * limit is counted from `ai_runs` at `checkEnhanceAllowance`, not a QuotaKey,
 * and the fair-use meter is never consulted. N3: nothing is written — the member
 * ticks changes and saves through `updateProfile`. N7: the log line carries
 * counts only and no error here carries profile content.
 */
export interface EnhanceResult {
  proposals: ProfileProposal[];
  questions: ProfileQuestion[];
  dropped: number;
  status: EnhanceView;
}

export async function enhanceProfile(): Promise<Result<EnhanceResult>> {
  const featureOn = await requireFeature("profile_enhance");
  if (!featureOn.ok) return featureOn;
  const user = await requireUser();
  if (!user.ok) return user;
  const uid = user.value;

  const limited = rateLimit(`enhance:${uid}`, LIMITS.enhance.limit, LIMITS.enhance.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `That's a lot at once. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const allowance = await checkEnhanceAllowance(uid);
  if (!allowance.ok) return allowance;

  const profile = await getProfile(uid);
  if (!profile) return err(appError("not_found", "Import your résumé first."));
  const parsed = StoredResumeSchema.safeParse(profile.resumeJson);
  if (!parsed.success) return err(appError("invalid_input", "Your profile needs a save before it can be enhanced."));
  const resume = parsed.data;

  const questions = profileQuestions(resume);
  const dupes = duplicateSkillProposals(resume);
  const fields = enhanceableFields(resume);

  // No fields means an empty schema, which strict mode may reject — and nothing to improve anyway.
  let kept: ProfileProposal[] = [];
  let dropped = 0;
  if (fields.length > 0) {
    const out = await enhanceProfileAi({ clerkUserId: uid, fields });
    if (!out.ok) return out;
    ({ kept, dropped } = filterProposals(fields, out.value.proposals, enhanceProfileTerms(resume)));
  }

  const read = await readEnhanceAllowance(uid);
  const status = read
    ? enhanceView(read.allowance, read.blocked)
    : enhanceView(allowance.value, null);

  console.info(`[enhance] fields=${fields.length} kept=${kept.length} dropped=${dropped} questions=${questions.length}`);

  return ok({ proposals: [...kept, ...dupes], questions, dropped, status });
}
