"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkAnalysisAllowance, checkTokenAllowance, requireUser } from "@/lib/auth";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract/text";
import { getProfile } from "@/lib/db/queries/profile";
import { findByContentHash } from "@/lib/db/queries/analysis";
import { appError, err, ok, type Result } from "@/lib/domain/types";

/**
 * Creating an analysis (F2).
 *
 * This action only CREATES the row and returns its id — the pipeline itself
 * runs in a streaming route handler (app/api/analyze/[id]/route.ts) because the
 * parsing screen shows real per-stage state, not a fake timer (F3).
 */

export async function createAnalysis(input: {
  source: "paste" | "upload";
  text?: string;
  filename?: string;
  fileBase64?: string;
  /**
   * The member hit the token wall and chose "Queue it" (F19). The row is
   * created and stamped `queued_at` instead of being refused, so the posting is
   * kept and does not have to be found and pasted again after the reset.
   *
   * Re-checked, never trusted: if the balance turns out to be fine the run
   * starts normally. A client that could set this at will would be a client
   * that could park a run it was perfectly able to pay for.
   */
  queue?: boolean;
}): Promise<Result<{ analysisId: string; reused: boolean; queued: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const profile = await getProfile(user.value);
  if (!profile) {
    return err(appError("not_found", "Import your résumé first — there's nothing to match against yet."));
  }

  let rawText: string;
  let filename: string | null = null;

  if (input.source === "paste") {
    rawText = (input.text ?? "").trim();
    if (rawText.length < 120) {
      return err(appError("invalid_input", "That's too short to be a job posting. Paste the full text."));
    }
  } else {
    if (!input.fileBase64) return err(appError("invalid_input", "No file received."));
    const buffer = Buffer.from(input.fileBase64, "base64");
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return err(appError("invalid_input", "That file is over the 5 MB limit."));
    }
    const extracted = await extractText(buffer, input.filename ?? "posting");
    if (!extracted.ok) return err(extracted.error);
    rawText = extracted.value.text;
    filename = input.filename ?? null;
  }

  // F2 acceptance: identical JD text reuses the prior analysis, no second charge.
  const contentHash = createHash("sha256").update(normalise(rawText)).digest("hex");
  const existing = await findByContentHash(user.value, contentHash);
  if (existing) return ok({ analysisId: existing.id, reused: true, queued: false });

  const limited = rateLimit(
    `analysis:${user.value}`,
    LIMITS.analysis.limit,
    LIMITS.analysis.windowSeconds,
  );
  if (!limited.allowed) {
    return err(
      appError("invalid_input", `Too many analyses at once. Try again in ${limited.retryAfterSeconds}s.`),
    );
  }

  const allowance = await checkAnalysisAllowance(user.value);
  if (!allowance.ok) return allowance;

  // The meter, checked before anything is created (F19). A wall here returns
  // the whole dialog — balance, shortfall, reset date, every exit — because a
  // refusal with nowhere to go is the failure this feature exists to remove.
  const tokens = await checkTokenAllowance(user.value, "analysis");
  const walled = !tokens.ok;
  if (walled && !input.queue) return tokens;

  // The row IS the charge — see lib/auth.ts. A create that throws leaves
  // nothing behind, so there is no refund to get wrong.
  const row = await db.analysis.create({
    data: {
      clerkUserId: user.value,
      profileId: profile.id,
      jdSource: input.source,
      jdFilename: filename,
      rawText,
      contentHash,
      status: "parsing",
      // Stamped only when the wall was real. Queuing a run we could afford
      // would park a posting for no reason and hide it behind a reset date.
      queuedAt: walled ? new Date() : null,
    },
    select: { id: true },
  });

  revalidatePath("/history");
  revalidatePath("/analyze");
  return ok({ analysisId: row.id, reused: false, queued: walled });
}

/**
 * Start a run that was parked against the wall (F19).
 *
 * Clearing `queued_at` is the whole action. The analysis is already `parsing`
 * with its posting stored, so the ordinary pipeline route picks it up from
 * there — there is no second execution path, no worker, and nothing that runs
 * on a schedule (CLAUDE.md §8).
 *
 * The meter is checked again here AND in the pipeline route. Not belt and
 * braces: this one gives the member the dialog back if they are still short,
 * and that one refuses a run that reached the pipeline by any other door.
 */
export async function startQueuedAnalysis(analysisId: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const tokens = await checkTokenAllowance(user.value, "analysis");
  if (!tokens.ok) return tokens;

  // updateMany, scoped by subject: an id from someone else's account matches
  // nothing rather than throwing, which is the same shape every other action
  // here uses to avoid confirming that a row exists.
  const { count } = await db.analysis.updateMany({
    where: { id: analysisId, clerkUserId: user.value, queuedAt: { not: null } },
    data: { queuedAt: null },
  });
  if (count === 0) {
    return err(appError("not_found", "That posting isn't waiting any more — it may have started."));
  }

  revalidatePath("/analyze");
  return ok({ id: analysisId });
}

/** Drop a parked posting. The row goes; nothing about it was ever charged. */
export async function discardQueuedAnalysis(analysisId: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;

  await db.analysis.deleteMany({
    where: { id: analysisId, clerkUserId: user.value, queuedAt: { not: null }, status: "parsing" },
  });

  revalidatePath("/analyze");
  revalidatePath("/history");
  return ok(null);
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
