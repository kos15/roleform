import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/db/queries/profile";
import { listSavedJobs } from "@/lib/db/queries/jobs";
import { checkJobSearchAllowance } from "@/lib/auth";
import { buildJobQuery } from "@/lib/domain/job-query";
import { EmptyState } from "@/components/ui";
import { PageIntro } from "@/components/page-intro";
import { JobSearchClient } from "./job-search-client";
import { SavedJobsPanel } from "./saved-jobs-panel";
import { CapNotice } from "./cap-notice";
import type { StoredResume } from "@/lib/ai/schemas/resume-json";

/**
 * F22 — Job search. Listings from documented APIs, matched to the profile's
 * own titles, skills and location — never a scrape, never a model call for
 * "fit" (N17/N20). Free makes zero outbound requests: the cap is checked
 * before the query editor renders, and a cap of 0 shows the wall instead
 * (JS-9).
 */
export default async function JobsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [profile, saved] = await Promise.all([getProfile(userId), listSavedJobs(userId)]);

  if (!profile) {
    return (
      <div className="max-w-2xl">
        <EmptyState title="Import your résumé first">
          Job search matches listings against your profile's titles and skills — without a profile
          there is nothing to match against.
        </EmptyState>
        <div className="mt-5">
          <Link href="/onboarding" className="btn btn-primary">
            Import résumé
          </Link>
        </div>
      </div>
    );
  }

  const resume = profile.resumeJson as unknown as StoredResume;
  const baseQuery = buildJobQuery(resume);

  // Settled and checked here, server-side, before anything renders — a cap
  // of 0 on Free means the query editor never even mounts, and no adapter is
  // ever called (JS-9).
  const allowance = await checkJobSearchAllowance(userId);

  return (
    <div>
      <PageIntro kicker="Job search" title="Listings matched to your own profile">
        Titles, skills and a city — nothing else about your profile leaves this server. Fit is
        shown as the skills a listing actually mentions, never a score.
      </PageIntro>

      {!allowance.ok && allowance.error.capWall ? (
        <CapNotice wall={allowance.error.capWall} />
      ) : (
        <JobSearchClient baseQuery={baseQuery} />
      )}

      <SavedJobsPanel jobs={saved} />
    </div>
  );
}
