import "server-only";
import { runAgent } from "../agents/define";
import { profileEnhancer } from "../agents/profile-enhancer";
import type { EnhanceProposalOut } from "../schemas/profile-enhance";
import type { EnhanceField } from "@/lib/domain/enhance";
import { ok, type Result } from "@/lib/domain/types";

/** One fast call over the member's content fields. No analysis, so no analysisId. */
export async function enhanceProfile(args: {
  clerkUserId: string;
  fields: EnhanceField[];
}): Promise<Result<{ proposals: EnhanceProposalOut[] }>> {
  const r = await runAgent(profileEnhancer, { fields: args.fields }, { clerkUserId: args.clerkUserId });
  if (!r.ok) return r;
  return ok({ proposals: r.value.value.proposals });
}
