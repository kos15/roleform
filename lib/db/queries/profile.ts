import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { experienceBullets, masterProfiles, sourceDocuments } from "@/lib/db/schema";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";
import type { DomainBullet } from "@/lib/domain/types";
import { skillsIn } from "@/lib/catalog/skills";

/**
 * Every query here takes clerkUserId and scopes on it. RLS is the second lock,
 * not the only one (CLAUDE.md §7) — this connection uses database credentials
 * and bypasses RLS, so the scoping is not optional.
 */

export async function getProfile(clerkUserId: string) {
  const [profile] = await db
    .select()
    .from(masterProfiles)
    .where(eq(masterProfiles.clerkUserId, clerkUserId))
    .orderBy(desc(masterProfiles.updatedAt))
    .limit(1);
  return profile ?? null;
}

export async function getProfileWithDocument(clerkUserId: string) {
  const profile = await getProfile(clerkUserId);
  if (!profile) return null;
  if (!profile.sourceDocumentId) return { profile, document: null };
  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, profile.sourceDocumentId),
        eq(sourceDocuments.clerkUserId, clerkUserId),
      ),
    );
  return { profile, document: document ?? null };
}

export async function getBullets(clerkUserId: string, profileId: string) {
  return db
    .select()
    .from(experienceBullets)
    .where(
      and(
        eq(experienceBullets.clerkUserId, clerkUserId),
        eq(experienceBullets.profileId, profileId),
      ),
    )
    .orderBy(asc(experienceBullets.ordinal));
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

  return db.transaction(async (tx) => {
    // Replacing a résumé supersedes the previous profile. Past analyses keep
    // their snapshotted original_text, so nothing already generated changes.
    await tx.delete(masterProfiles).where(eq(masterProfiles.clerkUserId, args.clerkUserId));

    const [profile] = await tx
      .insert(masterProfiles)
      .values({
        clerkUserId: args.clerkUserId,
        resumeJson: resume,
        sourceDocumentId: args.sourceDocumentId,
        yearsExperience: String(yearsExperience),
        skillCount: resume.skills.length,
      })
      .returning({ id: masterProfiles.id });

    const rows: Array<typeof experienceBullets.$inferInsert> = [];
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

    if (rows.length > 0) await tx.insert(experienceBullets).values(rows);

    resume.x_roleform = {
      schemaVersion: 1,
      bulletIds,
      sensitivity: resume.x_roleform?.sensitivity ?? { hidePhone: false, hideAddress: true },
    };
    resume.$schema =
      "https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json";

    await tx
      .update(masterProfiles)
      .set({ resumeJson: resume })
      .where(eq(masterProfiles.id, profile.id));

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
