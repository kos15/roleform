import "server-only";
import { db } from "@/lib/db";

/**
 * OUT-1 — no invented resources. The critical output guardrail.
 *
 * guardrails.md is explicit about the mechanism, and it is worth restating
 * because it is the reason a prompt injection carried in a job description
 * cannot put a link in front of a user:
 *
 *   > Every URL must be read FROM THE DATABASE, never from model output — the
 *   > synthesiser is given IDs and titles and returns IDs; the serialiser looks
 *   > up the URL. A model cannot invent a link it was never asked to write.
 *
 * The Zod schema (lib/ai/schemas/learning-plan.ts) has no URL field, so the
 * model has nowhere to put one. This function closes the other half: every id
 * that survives into a stored step must resolve to a live row.
 *
 * A resource that fails here is stripped and the gap falls back to its roadmap
 * link. That is a degradation of one gap, never a failure of the run.
 */
export async function assertResourcesLive(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();

  const rows = await db.course.findMany({
    where: { id: { in: unique }, status: "active" },
    select: { id: true },
  });

  const live = new Set(rows.map((r) => r.id));

  if (live.size !== unique.length) {
    // Sev-2 per guardrails.md: a recurring OUT-1 means the S6 prompt is
    // drifting and needs a version bump, not a patch. Ids only — they are not
    // user data, and nothing else about the run is logged (N7).
    const dropped = unique.filter((id) => !live.has(id));
    console.error(`[learning] OUT-1 stripped ${dropped.length} resource(s): ${dropped.join(",")}`);
  }

  return live;
}
