/**
 * The ProfileEnhancer's contract (F34, N6). The path enum is built from the
 * member's own fields, so the model cannot name a field it was not shown; there
 * is no URL field at all, and `kind: "remove"` is only offered for highlights.
 *
 * Combined with `z.union`, never `z.discriminatedUnion`: that emits `oneOf`,
 * which OpenAI's strict structured-output mode rejects.
 */
import { z } from "zod";
import {
  ENHANCE_MAX_PROPOSALS,
  ENHANCE_REASON_MAX,
  ENHANCE_TEXT_MAX,
  isHighlightPath,
  type EnhanceField,
} from "@/lib/domain/enhance";

/** Static shape, for the inferred type only — the runtime schema is input-shaped. */
export const EnhanceProposalOutSchema = z.union([
  z.object({
    kind: z.enum(["rephrase", "tidy"]),
    path: z.string(),
    text: z.string(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("remove"),
    path: z.string(),
    reason: z.string(),
  }),
]);

export type EnhanceProposalOut = z.infer<typeof EnhanceProposalOutSchema>;

function tuple(values: string[]): [string, ...string[]] {
  return values as [string, ...string[]];
}

export function profileEnhanceSchema(
  fields: readonly EnhanceField[],
): z.ZodType<{ proposals: EnhanceProposalOut[] }> {
  const paths = fields.map((f) => f.path);
  const highlightPaths = paths.filter(isHighlightPath);
  const reason = z.string().min(1).max(ENHANCE_REASON_MAX);

  if (paths.length === 0) {
    return z.object({ proposals: z.array(z.never()).max(0) }) as unknown as z.ZodType<{
      proposals: EnhanceProposalOut[];
    }>;
  }

  const edit = z.object({
    kind: z.enum(["rephrase", "tidy"]),
    path: z.enum(tuple(paths)),
    text: z.string().min(1).max(ENHANCE_TEXT_MAX),
    reason,
  });
  const remove = z.object({
    kind: z.literal("remove"),
    path: z.enum(tuple(highlightPaths)),
    reason,
  });
  const item = highlightPaths.length > 0 ? z.union([edit, remove]) : edit;

  return z.object({
    proposals: z.array(item).max(ENHANCE_MAX_PROPOSALS),
  }) as unknown as z.ZodType<{ proposals: EnhanceProposalOut[] }>;
}
