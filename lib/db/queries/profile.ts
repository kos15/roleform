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

/**
 * Whether there is a corpus at all — an id, never the résumé JSON.
 *
 * The landing page asks this to decide where its one button points, and
 * `getProfile` would drag a whole stored résumé across for a boolean.
 */
export async function hasProfile(clerkUserId: string): Promise<boolean> {
  const row = await db.masterProfile.findFirst({
    where: { clerkUserId },
    select: { id: true },
  });
  return row !== null;
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

/** The living profile. Retired bullets are history, not corpus (§6.2 inv. 4). */
export async function getBullets(clerkUserId: string, profileId: string) {
  return db.experienceBullet.findMany({
    where: { clerkUserId, profileId, retiredAt: null },
    orderBy: { ordinal: "asc" },
  });
}

/**
 * How often each bullet has actually been used as evidence.
 *
 * Counted from `tailored_bullets`, which is the only place that fact exists —
 * a bullet is evidence when a draft cited it, and N1 guarantees every draft
 * line has a source. This is what makes the profile's "never used as evidence"
 * label worth reading: it is a measurement, not an encouragement.
 *
 * **Counted per ANALYSIS, not per row.** One run renders the bullet into eleven
 * templates, so a naive row count says "used 6×" for a bullet used once, and
 * the number climbs six at a time for work the person did once. The label says
 * "used as evidence N×"; N has to be the number of postings it answered.
 */
export async function getEvidenceCounts(clerkUserId: string): Promise<Map<string, number>> {
  const rows = await db.tailoredBullet.findMany({
    where: { clerkUserId },
    select: { sourceBulletId: true, draft: { select: { analysisId: true } } },
  });

  const analysesPerBullet = new Map<string, Set<string>>();
  for (const row of rows) {
    const seen = analysesPerBullet.get(row.sourceBulletId) ?? new Set<string>();
    seen.add(row.draft.analysisId);
    analysesPerBullet.set(row.sourceBulletId, seen);
  }

  return new Map([...analysesPerBullet].map(([id, set]) => [id, set.size]));
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
 * Skills the recent postings asked for that the profile doesn't list.
 *
 * Drawn from this user's own `skill_gaps` — the things analyses have already
 * found missing — rather than from a generic "popular skills" list. That makes
 * the suggestion a fact about postings they actually looked at, and it is why
 * the section is titled "from your recent analyses" and not "trending".
 *
 * Adding one is a claim, not proof: it puts a name on the profile with no
 * bullet behind it, which is exactly why the skills section says so.
 */
export async function getSuggestedSkills(
  clerkUserId: string,
  alreadyListed: string[],
  limit = 6,
): Promise<string[]> {
  const gaps = await db.skillGap.findMany({
    where: { clerkUserId },
    orderBy: { mentionCount: "desc" },
    take: 60,
    select: { skill: { select: { name: true } } },
  });

  const have = new Set(alreadyListed.map((s) => s.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const gap of gaps) {
    const name = gap.skill.name;
    const key = name.toLowerCase();
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }

  return out;
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

/**
 * Saving an edit to an EXISTING profile (M2.6).
 *
 * Distinct from `commitProfile` on purpose, and the distinction is the whole
 * point. `commitProfile` is the import path: it replaces the profile, which
 * cascades every `experience_bullets` row away and mints new ids. Running that
 * on every autosave did two bad things — it broke outright once any analysis
 * existed (`tailored_bullets.source_bullet_id` is `onDelete: Restrict`, N1),
 * and where it did succeed it severed every past draft's route back to the
 * bullet it came from.
 *
 * This path matches on the paths already recorded in `x_roleform.bulletIds`:
 *
 *   - a path that still exists  → UPDATE the text in place, id unchanged
 *   - a path that is new        → INSERT with a fresh id
 *   - a path that has gone      → RETIRE, never delete
 *
 * Retiring is what lets someone remove a bullet from their profile without
 * rewriting the history of an analysis that quoted it.
 */
export async function saveProfileEdit(args: {
  clerkUserId: string;
  profileId: string;
  resume: StoredResume;
}): Promise<{ profileId: string; retired: number }> {
  const resume = structuredClone(args.resume);
  const previousIds = resume.x_roleform?.bulletIds ?? {};

  // Path → text, in the order the document lists them. Ordinal is that order,
  // so reordering bullets on screen reorders them in the corpus too.
  const present: Array<{
    path: string;
    scope: "work" | "project" | "volunteer";
    scopeRef: string;
    text: string;
    recencyMonths: number | null;
  }> = [];

  resume.work.forEach((work, wi) =>
    work.highlights.forEach((text, hi) =>
      present.push({
        path: `work.${wi}.highlights.${hi}`,
        scope: "work",
        scopeRef: `work.${wi}`,
        text,
        recencyMonths: monthsSince(work.endDate),
      }),
    ),
  );
  resume.projects.forEach((project, pi) =>
    project.highlights.forEach((text, hi) =>
      present.push({
        path: `projects.${pi}.highlights.${hi}`,
        scope: "project",
        scopeRef: `projects.${pi}`,
        text,
        recencyMonths: monthsSince(project.endDate),
      }),
    ),
  );
  resume.volunteer.forEach((v, vi) =>
    v.highlights.forEach((text, hi) =>
      present.push({
        path: `volunteer.${vi}.highlights.${hi}`,
        scope: "volunteer",
        scopeRef: `volunteer.${vi}`,
        text,
        recencyMonths: monthsSince(v.endDate),
      }),
    ),
  );

  const bulletIds: Record<string, string> = {};
  const keptIds = new Set<string>();

  return db.$transaction(async (tx) => {
    for (const [ordinal, entry] of present.entries()) {
      const existingId = previousIds[entry.path];

      if (existingId) {
        // updateMany, not update: a stale path in the extension must not throw
        // in the middle of someone's save.
        const { count } = await tx.experienceBullet.updateMany({
          where: { id: existingId, clerkUserId: args.clerkUserId },
          data: {
            text: entry.text,
            scope: entry.scope,
            scopeRef: entry.scopeRef,
            ordinal,
            recencyMonths: entry.recencyMonths,
            retiredAt: null,
          },
        });
        if (count > 0) {
          bulletIds[entry.path] = existingId;
          keptIds.add(existingId);
          continue;
        }
      }

      const created = await tx.experienceBullet.create({
        data: {
          clerkUserId: args.clerkUserId,
          profileId: args.profileId,
          scope: entry.scope,
          scopeRef: entry.scopeRef,
          ordinal,
          text: entry.text,
          recencyMonths: entry.recencyMonths,
        },
        select: { id: true },
      });
      bulletIds[entry.path] = created.id;
      keptIds.add(created.id);
    }

    const { count: retired } = await tx.experienceBullet.updateMany({
      where: {
        clerkUserId: args.clerkUserId,
        profileId: args.profileId,
        retiredAt: null,
        id: { notIn: [...keptIds] },
      },
      data: { retiredAt: new Date() },
    });

    resume.x_roleform = {
      schemaVersion: 1,
      bulletIds,
      sensitivity: resume.x_roleform?.sensitivity ?? { hidePhone: false, hideAddress: true },
      skillYears: resume.x_roleform?.skillYears,
      preferences: resume.x_roleform?.preferences,
    };

    await tx.masterProfile.update({
      where: { id: args.profileId },
      data: {
        resumeJson: resume as object,
        skillCount: resume.skills.length,
        yearsExperience: String(estimateYears(resume)),
        updatedAt: new Date(),
      },
    });

    return { profileId: args.profileId, retired };
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
