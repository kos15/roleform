import "server-only";
import { db } from "@/lib/db";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import type { DomainBullet } from "@/lib/domain/types";
import { skillsIn } from "@/lib/catalog/skills";

/**
 * Every query here takes clerkUserId and scopes on it. RLS is the second lock,
 * not the only one (CLAUDE.md §7) — this connection uses database credentials
 * and bypasses RLS, so the scoping is not optional.
 */

export async function getProfile(clerkUserId: string) {
  return db.masterProfile.findFirst({
    where: { clerkUserId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProfileWithDocument(clerkUserId: string) {
  const profile = await getProfile(clerkUserId);
  if (!profile) return null;
  if (!profile.sourceDocumentId) return { profile, document: null };
  const document = await db.sourceDocument.findFirst({
    where: { id: profile.sourceDocumentId, clerkUserId },
  });
  return { profile, document: document ?? null };
}

export async function getBullets(clerkUserId: string, profileId: string) {
  return db.experienceBullet.findMany({
    where: { clerkUserId, profileId },
    orderBy: { ordinal: "asc" },
  });
}

export function toDomainBullets(
  rows: Array<{
    id: string;
    text: string;
    scope: "work" | "project" | "volunteer" | "education";
    scopeRef: string;
    recencyMonths: number | null;
  }>,
): DomainBullet[] {
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    scope: r.scope,
    scopeRef: r.scopeRef,
    skillNames: skillsIn(r.text),
    recencyMonths: r.recencyMonths,
  }));
}

/**
 * Commits a reviewed draft (F1). Atomizes every highlight into exactly one
 * experience_bullets row with a stable id, and writes that id back into
 * x_roleform.bulletIds so a render can find its way home.
 *
 * This is the ONLY path that writes experience_bullets, and it runs only after
 * the user confirms the review screen (N3).
 */
export async function commitProfile(args: {
  clerkUserId: string;
  resume: StoredResume;
  sourceDocumentId: string | null;
}): Promise<{ profileId: string; bulletCount: number; yearsExperience: number }> {
  const resume = structuredClone(args.resume);
  const yearsExperience = estimateYears(resume);

  return db.$transaction(async (tx) => {
    // Replacing a résumé supersedes the previous profile. Past analyses keep
    // their snapshotted original_text, so nothing already generated changes.
    await tx.masterProfile.deleteMany({ where: { clerkUserId: args.clerkUserId } });

    const profile = await tx.masterProfile.create({
      data: {
        clerkUserId: args.clerkUserId,
        resumeJson: resume as object,
        sourceDocumentId: args.sourceDocumentId,
        yearsExperience: String(yearsExperience),
        skillCount: resume.skills.length,
      },
      select: { id: true },
    });

    const rows: Array<{
      id: string;
      clerkUserId: string;
      profileId: string;
      scope: "work" | "project" | "volunteer" | "education";
      scopeRef: string;
      ordinal: number;
      text: string;
      recencyMonths: number | null;
    }> = [];
    const bulletIds: Record<string, string> = {};
    let ordinal = 0;

    const push = (
      scope: "work" | "project" | "volunteer" | "education",
      scopeRef: string,
      path: string,
      text: string,
      recencyMonths: number | null,
    ) => {
      const id = crypto.randomUUID();
      bulletIds[path] = id;
      rows.push({
        id,
        clerkUserId: args.clerkUserId,
        profileId: profile.id,
        scope,
        scopeRef,
        ordinal: ordinal++,
        text,
        recencyMonths,
      });
    };

    resume.work.forEach((work, wi) =>
      work.highlights.forEach((text, hi) =>
        push("work", `work.${wi}`, `work.${wi}.highlights.${hi}`, text, monthsSince(work.endDate)),
      ),
    );
    resume.projects.forEach((project, pi) =>
      project.highlights.forEach((text, hi) =>
        push(
          "project",
          `projects.${pi}`,
          `projects.${pi}.highlights.${hi}`,
          text,
          monthsSince(project.endDate),
        ),
      ),
    );
    resume.volunteer.forEach((v, vi) =>
      v.highlights.forEach((text, hi) =>
        push("volunteer", `volunteer.${vi}`, `volunteer.${vi}.highlights.${hi}`, text, monthsSince(v.endDate)),
      ),
    );

    if (rows.length > 0) await tx.experienceBullet.createMany({ data: rows });

    resume.x_roleform = {
      schemaVersion: 1,
      bulletIds,
      sensitivity: resume.x_roleform?.sensitivity ?? { hidePhone: false, hideAddress: true },
    };
    resume.$schema =
      "https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json";

    await tx.masterProfile.update({
      where: { id: profile.id },
      data: { resumeJson: resume as object },
    });

    return { profileId: profile.id, bulletCount: rows.length, yearsExperience };
  });
}

function monthsSince(endDate: string | null | undefined): number | null {
  if (!endDate) return 0; // current role
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(endDate);
  if (!m) return null;
  const end = new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0);
  const months = (Date.now() - end.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return Math.max(0, Math.round(months));
}

function estimateYears(resume: StoredResume): number {
  let months = 0;
  for (const work of resume.work) {
    const start = parseMonth(work.startDate);
    const end = work.endDate ? parseMonth(work.endDate) : new Date();
    if (!start || !end) continue;
    months += Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  }
  return Math.round((months / 12) * 10) / 10;
}

function parseMonth(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(iso);
  return m ? new Date(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0) : null;
}
