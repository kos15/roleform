"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { analyses } from "@/lib/db/schema";
import { consumeAnalysisQuota, refundAnalysisQuota, requireUser } from "@/lib/auth";
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
}): Promise<Result<{ analysisId: string; reused: boolean }>> {
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
  if (existing) return ok({ analysisId: existing.id, reused: true });

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

  const quota = await consumeAnalysisQuota(user.value);
  if (!quota.ok) return quota;

  try {
    const [row] = await db
      .insert(analyses)
      .values({
        clerkUserId: user.value,
        profileId: profile.id,
        jdSource: input.source,
        jdFilename: filename,
        rawText,
        contentHash,
        status: "parsing",
      })
      .returning({ id: analyses.id });

    revalidatePath("/history");
    return ok({ analysisId: row.id, reused: false });
  } catch (e) {
    // Never charge for a run that never started.
    await refundAnalysisQuota(user.value);
    throw e;
  }
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
