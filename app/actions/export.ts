"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/services/auth";
import { LIMITS, rateLimit } from "@/lib/services/rate-limit";
import {
  getAnalysis,
  getDraft,
  getDrafts,
  getTailoredBullets,
} from "@/lib/db/queries/analysis";
import { buildRenderModel, exportFilename } from "@/lib/render/model";
import { renderPdf } from "@/lib/render/pdf";
import { renderDocx } from "@/lib/render/docx";
import { zipFiles } from "@/lib/render/zip";
import { templateById } from "@/lib/render/templates";
import { BUCKET_EXPORTS, exportPath, removeObjects, signedUrl, uploadObject } from "@/lib/supabase/storage";
import { appError, err, ok, type Result } from "@/lib/domain/types";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/** Export (F9). Both formats render from the same resume_json. */

export async function exportDraft(
  draftId: string,
  format: "pdf" | "docx",
): Promise<Result<{ signedUrl: string; filename: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const limited = rateLimit(`export:${user.value}`, LIMITS.export.limit, LIMITS.export.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many exports. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const built = await buildOne(user.value, draftId, format);
  if (!built.ok) return built;

  // A fresh key per export. Re-exporting used to overwrite one fixed key, and
  // the CDN in front of `exports` could keep handing back the earlier render,
  // so a draft regenerated against the posting downloaded as the old file.
  const path = exportPath(
    user.value,
    built.value.analysisId,
    built.value.filename.replace(/(\.[a-z]+)$/, `-${Date.now().toString(36)}$1`),
  );
  const { bytes } = await uploadObject(BUCKET_EXPORTS, path, built.value.body, MIME[format]);

  const superseded = await db.export.findMany({
    where: { clerkUserId: user.value, draftId, format },
    select: { id: true, storagePath: true },
  });

  await db.export.create({
    data: {
      clerkUserId: user.value,
      analysisId: built.value.analysisId,
      draftId,
      format,
      storagePath: path,
      bytes,
    },
  });

  // Only the newest render of a draft is kept; older ones are unreachable anyway.
  await removeObjects(
    BUCKET_EXPORTS,
    superseded.map((e) => e.storagePath).filter((p) => p !== path),
  );
  if (superseded.length > 0) {
    await db.export.deleteMany({ where: { id: { in: superseded.map((e) => e.id) } } });
  }

  return ok({
    // A PDF opens in a tab, so it must not be sent as an attachment; the stamp
    // rides at the end of its name instead. A DOCX downloads under the plain one.
    signedUrl: await signedUrl(BUCKET_EXPORTS, path, format === "docx" ? built.value.filename : undefined),
    filename: built.value.filename,
  });
}

/**
 * "Download all" — 6 templates × 2 formats = 12 renders plus a zip (M6.5).
 *
 * Measure p95 here. This is the single largest unit of work in the product and
 * the most likely trigger for the job-queue decision (CLAUDE.md §12).
 */
export async function exportAll(
  analysisId: string,
): Promise<Result<{ signedUrl: string; fileCount: number; elapsedMs: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const limited = rateLimit(`export:${user.value}`, LIMITS.export.limit, LIMITS.export.windowSeconds);
  if (!limited.allowed) {
    return err(appError("invalid_input", `Too many exports. Try again in ${limited.retryAfterSeconds}s.`));
  }

  const startedAt = Date.now();
  const drafts = await getDrafts(user.value, analysisId);
  if (drafts.length === 0) return err(appError("not_found", "There are no drafts to download yet."));

  const files: Array<{ name: string; body: Buffer }> = [];
  for (const draft of drafts) {
    for (const format of ["pdf", "docx"] as const) {
      const built = await buildOne(user.value, draft.id, format);
      if (built.ok) files.push({ name: built.value.filename, body: built.value.body });
    }
  }

  const zip = await zipFiles(files);
  const path = exportPath(user.value, analysisId, `all-${Date.now().toString(36)}.zip`);
  const { bytes } = await uploadObject(BUCKET_EXPORTS, path, zip, "application/zip");
  const supersededZips = await db.export.findMany({
    where: { clerkUserId: user.value, analysisId, format: "zip" },
    select: { id: true, storagePath: true },
  });
  await removeObjects(BUCKET_EXPORTS, supersededZips.map((e) => e.storagePath));
  if (supersededZips.length > 0) {
    await db.export.deleteMany({ where: { id: { in: supersededZips.map((e) => e.id) } } });
  }

  await db.export.create({
    data: {
      clerkUserId: user.value,
      analysisId,
      draftId: null,
      format: "zip",
      storagePath: path,
      bytes,
    },
  });

  const elapsedMs = Date.now() - startedAt;
  // p95 > 20s (specs §11) is the queue trigger. Logged, not swallowed.
  console.info(`[export] all analysis=${analysisId} files=${files.length} ms=${elapsedMs}`);

  return ok({
    signedUrl: await signedUrl(BUCKET_EXPORTS, path, "all.zip"),
    fileCount: files.length,
    elapsedMs,
  });
}

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

async function buildOne(
  clerkUserId: string,
  draftId: string,
  format: "pdf" | "docx",
): Promise<Result<{ body: Buffer; filename: string; analysisId: string }>> {
  const draft = await getDraft(clerkUserId, draftId);
  if (!draft) return err(appError("not_found", "We couldn't find that draft."));

  const analysis = await getAnalysis(clerkUserId, draft.analysisId);
  if (!analysis) return err(appError("not_found", "We couldn't find that analysis."));

  const template = templateById(draft.templateId);
  if (!template) return err(appError("not_found", "Unknown template."));

  const tailored = await getTailoredBullets(clerkUserId, draftId);
  const resume = draft.resumeJson as unknown as StoredResume & { x_orderedSkills?: string[] };

  const model = buildRenderModel({
    resume,
    tailored: tailored.map((t) => ({
      sourceBulletId: t.sourceBulletId,
      rewrittenText: t.rewrittenText,
      transform: t.transform,
      originalText: t.originalText,
    })),
    orderedSkills: resume.x_orderedSkills ?? [],
    summary: resume.basics.summary,
  });

  const body = format === "pdf" ? await renderPdf(model, template.id) : await renderDocx(model, template.id);

  return ok({
    body,
    filename: exportFilename({
      name: model.name,
      company: analysis.company ?? "",
      role: analysis.title ?? "",
      templateName: template.name,
      ext: format,
    }),
    analysisId: draft.analysisId,
  });
}
