"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sourceDocuments } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract/text";
import { extractProfile as extractProfileAi } from "@/lib/ai/extract-profile";
import { BUCKET_RESUMES, resumePath, uploadObject } from "@/lib/supabase/storage";
import { commitProfile as commitProfileDb } from "@/lib/db/queries/profile";
import { ResumeJsonSchema, type StoredResume } from "@/lib/ai/schemas/resume-json";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type { ExtractProfileResult } from "@/lib/ai/schemas/resume-json";

/**
 * Onboarding (F1, specs §14).
 *
 * upload → extract → MANDATORY REVIEW → commit. Nothing reaches
 * master_profiles or experience_bullets without the user confirming (N3).
 */

export async function uploadResume(
  formData: FormData,
): Promise<Result<{ documentId: string; extractionStatus: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const limited = rateLimit(`upload:${user.value}`, LIMITS.upload.limit, LIMITS.upload.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many uploads. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return err(appError("invalid_input", "No file received."));
  if (file.size > MAX_UPLOAD_BYTES) {
    return err(appError("invalid_input", "That file is over the 5 MB limit."));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractText(buffer, file.name);

  const documentId = crypto.randomUUID();
  const ext = extracted.ok ? extracted.value.kind : "bin";
  const path = resumePath(user.value, documentId, ext);

  // Store the original either way: an extraction failure is worth diagnosing,
  // and the user shouldn't have to re-upload to retry.
  await uploadObject(
    BUCKET_RESUMES,
    path,
    buffer,
    extracted.ok ? extracted.value.mime : "application/octet-stream",
  );

  const status = extracted.ok
    ? ("ok" as const)
    : extracted.error.code === "no_text_layer"
      ? ("no_text_layer" as const)
      : extracted.error.code === "encrypted_pdf"
        ? ("encrypted" as const)
        : ("failed" as const);

  await db.insert(sourceDocuments).values({
    id: documentId,
    clerkUserId: user.value,
    storagePath: path,
    bucket: BUCKET_RESUMES,
    mime: extracted.ok ? extracted.value.mime : "application/octet-stream",
    filename: file.name,
    sizeBytes: buffer.byteLength,
    extractionStatus: status,
    extractedText: extracted.ok ? extracted.value.text : null,
  });

  if (!extracted.ok) return err(extracted.error);
  return ok({ documentId, extractionStatus: status });
}

export async function extractProfile(
  documentId: string,
): Promise<Result<ExtractProfileResult>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(eq(sourceDocuments.id, documentId), eq(sourceDocuments.clerkUserId, user.value)),
    );

  if (!document) return err(appError("not_found", "We couldn't find that upload."));
  if (!document.extractedText) {
    return err(appError("extraction_failed", "There's no readable text in that document."));
  }

  const result = await extractProfileAi({
    clerkUserId: user.value,
    rawText: document.extractedText,
  });
  if (!result.ok) return result;
  return ok(result.value.result);
}

/**
 * Commit the reviewed draft. Re-validates against the schema at the boundary —
 * this input crossed the network from a client form, so it is untrusted even
 * though we produced its first draft.
 */
export async function commitProfile(
  draft: unknown,
  documentId: string | null,
): Promise<Result<{ profileId: string; bulletCount: number; yearsExperience: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const parsed = ResumeJsonSchema.safeParse(draft);
  if (!parsed.success) {
    return err(appError("invalid_input", "Some fields still need fixing before we can save this."));
  }
  if (parsed.data.work.every((w) => w.highlights.length === 0) && parsed.data.projects.length === 0) {
    return err(
      appError("invalid_input", "Add at least one bullet — Roleform has nothing to work from otherwise."),
    );
  }

  const result = await commitProfileDb({
    clerkUserId: user.value,
    resume: parsed.data as StoredResume,
    sourceDocumentId: documentId,
  });

  revalidatePath("/profile");
  revalidatePath("/analyze");
  return ok(result);
}

/** Profile editor autosave (M2.6). User-authored writes only (N3). */
export async function updateProfile(draft: unknown): Promise<Result<{ profileId: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const parsed = ResumeJsonSchema.safeParse(draft);
  if (!parsed.success) return err(appError("invalid_input", "That change didn't validate."));

  const existing = await db.query.masterProfiles.findFirst({
    where: (p, { eq: equals }) => equals(p.clerkUserId, user.value),
  });
  if (!existing) return err(appError("not_found", "No profile yet."));

  const result = await commitProfileDb({
    clerkUserId: user.value,
    resume: parsed.data as StoredResume,
    sourceDocumentId: existing.sourceDocumentId,
  });

  revalidatePath("/profile");
  return ok({ profileId: result.profileId });
}
