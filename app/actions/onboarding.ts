"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit, LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract/text";
import { MAX_RESUME_CHARS } from "@/lib/extract/normalise";
import { EXTRACT_ATTEMPTS, extractProfile as extractProfileAi } from "@/lib/ai/extract-profile";
import { transcribeDocument } from "@/lib/ai/transcribe";
import { BUCKET_RESUMES, downloadObject, resumePath, uploadObject } from "@/lib/supabase/storage";
import { commitProfile as commitProfileDb, saveProfileEdit } from "@/lib/db/queries/profile";
import {
  ResumeJsonSchema,
  StoredResumeSchema,
  type StoredResume,
} from "@/lib/ai/schemas/resume-json";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type { ExtractProfileResult } from "@/lib/ai/schemas/resume-json";

/**
 * Onboarding (F1, specs §14).
 *
 * upload (or paste) → [OCR, for scans and photos] → extract (up to three
 * visible attempts) → MANDATORY REVIEW → commit. Nothing reaches
 * master_profiles or experience_bullets without the user confirming (N3).
 */

export interface UploadedResume {
  documentId: string;
  extractionStatus: string;
  /** A scan or a photo: call `transcribeResume` before `extractProfile`. */
  needsOcr: boolean;
}

export async function uploadResume(formData: FormData): Promise<Result<UploadedResume>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const limited = rateLimit(`upload:${user.value}`, LIMITS.upload.limit, LIMITS.upload.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many uploads. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return err(appError("invalid_input", "No file received."));
  if (file.size > MAX_UPLOAD_BYTES) {
    return err(appError("invalid_input", "That file is over the 4 MB limit."));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractText(buffer, file.name);
  return storeDocument({
    clerkUserId: user.value,
    buffer,
    filename: file.name,
    extracted,
  });
}

/**
 * The fallback for a file nobody can read — a locked PDF, a format we don't
 * take, a scan too blurry for the vision pass. The text is stored like an
 * upload (as a .txt in the bucket), so delete still removes it and the rest
 * of the flow is identical.
 */
export async function pasteResume(text: string): Promise<Result<UploadedResume>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const limited = rateLimit(`upload:${user.value}`, LIMITS.upload.limit, LIMITS.upload.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many uploads. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const parsed = z.string().trim().min(200).max(MAX_RESUME_CHARS).safeParse(text);
  if (!parsed.success) {
    return err(
      appError(
        "invalid_input",
        text.trim().length < 200
          ? "That's too short to be a résumé. Paste the whole document."
          : "That's longer than a résumé usually is. Paste just the résumé.",
      ),
    );
  }

  const buffer = Buffer.from(parsed.data, "utf8");
  return storeDocument({
    clerkUserId: user.value,
    buffer,
    filename: "Pasted text",
    extracted: await extractText(buffer, "pasted.txt"),
  });
}

async function storeDocument(args: {
  clerkUserId: string;
  buffer: Buffer;
  filename: string;
  extracted: Awaited<ReturnType<typeof extractText>>;
}): Promise<Result<UploadedResume>> {
  const { extracted, buffer } = args;
  const documentId = crypto.randomUUID();
  const ext = extracted.ok ? extracted.value.kind : "bin";
  const path = resumePath(args.clerkUserId, documentId, ext);
  const mime = extracted.ok ? extracted.value.mime : "application/octet-stream";

  // Store the original either way: an extraction failure is worth diagnosing,
  // and the user shouldn't have to re-upload to retry.
  try {
    await uploadObject(BUCKET_RESUMES, path, buffer, mime);
  } catch {
    return err(appError("invalid_input", "We couldn't store that file just now. Try again in a moment."));
  }

  const needsOcr = extracted.ok && extracted.value.needsOcr;
  const status = extracted.ok
    ? needsOcr
      ? ("pending" as const)
      : ("ok" as const)
    : extracted.error.code === "no_text_layer"
      ? ("no_text_layer" as const)
      : extracted.error.code === "encrypted_pdf"
        ? ("encrypted" as const)
        : ("failed" as const);

  await db.sourceDocument.create({
    data: {
      id: documentId,
      clerkUserId: args.clerkUserId,
      storagePath: path,
      bucket: BUCKET_RESUMES,
      mime,
      filename: args.filename,
      sizeBytes: buffer.byteLength,
      extractionStatus: status,
      extractedText: extracted.ok && !needsOcr ? extracted.value.text : null,
    },
  });

  if (!extracted.ok) return err(extracted.error);
  return ok({ documentId, extractionStatus: status, needsOcr });
}

/**
 * The vision pass for a scan or photo. Runs once per document: the text it
 * produces is stored, so every extraction attempt after it reuses that text
 * rather than paying for the image again.
 */
export async function transcribeResume(documentId: string): Promise<Result<{ chars: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const id = z.string().uuid().safeParse(documentId);
  if (!id.success) return err(appError("invalid_input", "That upload reference isn't valid."));

  const document = await db.sourceDocument.findFirst({
    where: { id: id.data, clerkUserId: user.value },
  });
  if (!document) return err(appError("not_found", "We couldn't find that upload."));
  if (document.extractedText) return ok({ chars: document.extractedText.length });
  if (document.extractionStatus !== "pending") {
    return err(appError("extraction_failed", "There's no readable text in that document."));
  }

  const limited = rateLimit(`extract:${user.value}`, LIMITS.extract.limit, LIMITS.extract.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many attempts. Try again in ${limited.retryAfterSeconds}s.`));
  }

  let bytes: Buffer;
  try {
    bytes = await downloadObject(document.bucket, document.storagePath);
  } catch {
    return err({
      ...appError("model_failed", "We couldn't load your file just now. Try again in a moment."),
      failure: "transient",
    });
  }

  const result = await transcribeDocument({
    clerkUserId: user.value,
    data: new Uint8Array(bytes),
    mediaType: document.mime,
    filename: document.filename,
  });
  if (!result.ok) {
    if (result.error.code === "no_text_layer") {
      await db.sourceDocument.update({
        where: { id: document.id },
        data: { extractionStatus: "no_text_layer" },
      });
    }
    return result;
  }

  await db.sourceDocument.update({
    where: { id: document.id },
    data: { extractedText: result.value.text, extractionStatus: "ok" },
  });
  return ok({ chars: result.value.text.length });
}

const ExtractRequestSchema = z.object({
  documentId: z.string().uuid(),
  attempt: z.number().int().min(1).max(EXTRACT_ATTEMPTS),
  previousFailure: z.enum(["truncated", "schema", "verify", "transient", "rejected"]).nullable(),
  readFromImage: z.boolean(),
});

/**
 * One extraction attempt. The client calls this up to EXTRACT_ATTEMPTS times
 * and shows each one, passing back why the last one failed so the next is
 * adjusted rather than repeated (lib/ai/extract-profile.ts).
 */
export async function extractProfile(
  request: z.input<typeof ExtractRequestSchema>,
): Promise<Result<ExtractProfileResult>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const parsed = ExtractRequestSchema.safeParse(request);
  if (!parsed.success) return err(appError("invalid_input", "That request isn't valid."));
  const { documentId, attempt, previousFailure, readFromImage } = parsed.data;

  const document = await db.sourceDocument.findFirst({
    where: { id: documentId, clerkUserId: user.value },
  });

  if (!document) return err(appError("not_found", "We couldn't find that upload."));
  if (!document.extractedText) {
    return err(appError("extraction_failed", "There's no readable text in that document."));
  }

  const limited = rateLimit(`extract:${user.value}`, LIMITS.extract.limit, LIMITS.extract.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many attempts. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const result = await extractProfileAi({
    clerkUserId: user.value,
    rawText: document.extractedText,
    attempt,
    previousFailure,
    readFromImage,
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

  // StoredResumeSchema, not ResumeJsonSchema: the narrower one drops
  // x_roleform, and x_roleform is where the bullet ids live. Parsing a save
  // with it threw away every tailored bullet's route home (N1).
  const parsed = StoredResumeSchema.safeParse(draft);
  if (!parsed.success) return err(appError("invalid_input", "That change didn't validate."));

  const existing = await db.masterProfile.findFirst({ where: { clerkUserId: user.value } });
  if (!existing) return err(appError("not_found", "No profile yet."));

  // saveProfileEdit, not commitProfile: editing a profile is not importing one.
  // See the comment on saveProfileEdit for what the old path destroyed.
  const result = await saveProfileEdit({
    clerkUserId: user.value,
    profileId: existing.id,
    resume: parsed.data as StoredResume,
  });

  revalidatePath("/profile");
  return ok({ profileId: result.profileId });
}
