import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getProfileWithDocument } from "@/lib/db/queries/profile";
import { queuedRuns } from "@/lib/db/queries/tokens";
import { draftsPerRun } from "@/lib/db/queries/entitlement";
import { Card, EmptyState } from "@/components/ui";
import { JdInput } from "./jd-input";
import { QueuedRuns } from "./queued-runs";

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>;
}) {
  const { userId } = await auth();
  const profile = userId ? await getProfileWithDocument(userId) : null;
  // Almost always empty, and a partial index makes it cheap when it is (F19).
  const queued = userId ? await queuedRuns(userId) : [];
  // What this member's run will actually return. Read rather than written into
  // the copy: it is a per-member cap over an eleven-template catalog, so any
  // fixed number in this heading is wrong for somebody (F15).
  const drafts = userId ? await draftsPerRun(userId) : 0;

  // F22 §3.5 — "Analyse" on a saved listing lands here with its snippet
  // pre-filled. `job_listings` carries no user id (JS-9), so this read needs
  // no scoping beyond the id itself; the listing is public content either way.
  const { listing: listingId } = await searchParams;
  const listing = listingId
    ? await db.jobListing.findUnique({
        where: { id: listingId },
        select: { id: true, title: true, company: true, snippet: true },
      })
    : null;

  if (!profile) {
    return (
      <div className="max-w-2xl">
        <EmptyState title="Import your résumé first">
          Roleform matches a posting against your own experience. Without a profile there is
          nothing to match — and nothing we&rsquo;d be willing to invent.
        </EmptyState>
        <div className="mt-5">
          <Link href="/onboarding" className="btn btn-primary no-underline">
            Import résumé
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rise-in mb-[clamp(2rem,4vw,3rem)] max-w-[760px]">
        <p className="eyebrow mb-3.5">Step 1 of 3 · The posting</p>
        <h1 className="mb-5 text-[clamp(3rem,6.4vw,6rem)] leading-[0.92]">
          One résumé in.
          <br />
          {drafts} tailored out.
        </h1>
        <p className="max-w-[62ch] text-[17px] leading-relaxed text-[var(--color-text-muted)] [text-wrap:pretty]">
          Paste or drop the posting. Roleform reads it, scores how much of it your own profile can
          evidence, and returns {drafts} draft{drafts === 1 ? "" : "s"}, the questions this posting
          invites, and the gaps it exposes. Nothing is invented — every bullet traces back to
          something you wrote.
        </p>
      </div>

      <QueuedRuns
        runs={queued.map((run) => ({
          id: run.id,
          label: run.label,
          queued: run.queuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        }))}
      />

      {/* The aside carries the corpus and the contract; the posting goes in the
          left column. Keeping them side by side is the point — you can see what
          we'll be drawing on while you paste the thing we'll draw against. */}
      <div className="flex flex-wrap items-start gap-[clamp(1.5rem,3vw,2.5rem)]">
        {/* min-w-0 because a flex child defaults to min-width:auto, and the
            textarea inside would otherwise set the column's floor. */}
        <div className="min-w-0 flex-[1_1_30rem]">
          <JdInput
            initialListing={
              listing ? { id: listing.id, title: listing.title, company: listing.company, snippet: listing.snippet } : null
            }
          />
        </div>

        <aside className="flex min-w-0 flex-[0_1_22rem] flex-col gap-[18px] pt-[58px]">
          {/* The profile card: filename · Parsed · N yrs · N skills (F1). */}
          <Card flat className="p-6">
            <p className="eyebrow mb-3.5">Your profile</p>
            <div className="mb-3.5 flex items-center gap-3">
              <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px] bg-[var(--color-accent-500)]">
                <FileText className="lucide h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-extrabold">
                  {profile.document?.filename ?? "Your profile"}
                </span>
                <span className="block text-sm text-[var(--color-text-muted)]">
                  Parsed · {Number(profile.profile.yearsExperience)} yrs ·{" "}
                  {profile.profile.skillCount} skills
                </span>
              </span>
            </div>
            <p className="mb-[18px] text-sm leading-normal text-[var(--color-text-muted)]">
              This is the only corpus we draw on. Bullets get reordered, reworded and re-weighted —
              never invented.
            </p>
            {/* The DS classes rather than <Button> — a <button> inside an <a> is
                invalid, and this is a link that happens to look like a button. */}
            <Link href="/profile" className="btn btn-secondary w-full no-underline">
              Replace résumé
            </Link>
          </Card>

          <div className="rounded-[var(--radius-lg)] border-[1.5px] border-[var(--color-line)] p-6">
            <p className="eyebrow mb-4">What comes back</p>
            <ol className="flex flex-col gap-3.5 text-[15px] leading-normal">
              {[
                `${drafts} drafts across classic, sidebar and creative — each with a computed ATS rating`,
                "The questions this posting suggests, by family, with frameworks not scripts",
                "Requirements you can't yet evidence, and vetted courses that close them",
              ].map((text, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="display text-[22px] leading-[1.1] text-[var(--color-accent-600)]">
                    0{i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
