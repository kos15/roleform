"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Search, Users } from "lucide-react";
import { Button, Card, ErrorRegion, Input, Tag } from "@/components/ui";
import { CapWallDialog } from "@/components/cap-wall";
import { searchJobs, saveJob } from "@/app/actions/jobs";
import { POSTED_WITHIN_OPTIONS, type JobQuery } from "@/lib/domain/job-query";
import type { ListingCardView, ResultsView } from "@/lib/jobs/results";
import type { Tier } from "@/lib/domain/job-triage";
import type { CapWall } from "@/lib/domain/quotas";
import { JOB_PORTALS } from "@/lib/domain/job-portals";

/**
 * The query editor and triaged results (F22, F22.1).
 *
 * Fit is shown as named facts — the member's skills a listing names, the
 * skills it asks for that they lack, whether its title lines up, where it is
 * — grouped into tiers whose reasons sit on every card. Never a score, a
 * ring or the word "match" (N20). Every Open link is the provider's own
 * `url`, untouched (N18).
 */

const TIER_NOTE: Record<Tier, string> = {
  shortlist: "Your title, at least two of your skills, somewhere you said you'd work, and no seniority gap.",
  consider: "Your title or at least two of your skills — check the cautions before you spend an application on it.",
  long_shot: "Neither your title nor much of your skill set. Listed so nothing is hidden, not because it's likely.",
  ruled_out: "On-site, and your profile says remote only. Change that preference and these come back.",
};

function windowLabel(days: number): string {
  if (days === 0) return "Any date";
  if (days === 1) return "24 hours";
  return `${days} days`;
}

export function JobSearchClient({ baseQuery, initial }: { baseQuery: JobQuery; initial: ResultsView | null }) {
  const router = useRouter();
  const [titles, setTitles] = useState(baseQuery.titles.join(", "));
  const [location, setLocation] = useState(baseQuery.location);
  const [remote, setRemote] = useState(baseQuery.remote);
  const [postedWithin, setPostedWithin] = useState(initial?.postedWithinDays ?? baseQuery.postedWithinDays);
  const [results, setResults] = useState<ResultsView | null>(initial);
  const [tier, setTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchJobs({
        titles: titles
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        location,
        remote,
        postedWithinDays: postedWithin,
      });
      if (!result.ok) {
        if (result.error.capWall) setCapWall(result.error.capWall);
        else setError(result.error.message);
        return;
      }
      setResults(result.value);
      setTier(null);
    });
  }

  function save(listingId: string) {
    setSavedIds((prev) => new Set(prev).add(listingId));
    startTransition(async () => {
      const result = await saveJob(listingId);
      if (!result.ok) {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      } else {
        router.refresh();
      }
    });
  }

  // The first tier with anything in it, unless the member picked one.
  const shownTier: Tier | null = useMemo(() => {
    if (!results) return null;
    if (tier) return tier;
    return results.tiers.find((t) => t.cards.length > 0)?.tier ?? "shortlist";
  }, [results, tier]);
  const shownCards = results?.tiers.find((t) => t.tier === shownTier)?.cards ?? [];

  // Same split/trim/filter `search()` sends the server — the portal links
  // stay in sync with whatever's in the boxes right now, not the last query
  // that actually ran (JOB_PORTALS needs no result to build a URL from).
  const portalQuery: Pick<JobQuery, "titles" | "location" | "remote"> = {
    titles: titles.split(",").map((t) => t.trim()).filter(Boolean),
    location,
    remote,
  };

  return (
    <div className="mb-10">
      {capWall ? <CapWallDialog wall={capWall} onClose={() => setCapWall(null)} /> : null}

      <div data-help="job-search" className="mb-7 rounded-[var(--radius-xl)] bg-[var(--color-accent-500)] p-[clamp(1.25rem,2.6vw,1.9rem)]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-[2_1_16rem] flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em]">Titles — up to three are searched</span>
            <Input
              className="input-pill min-h-[50px]"
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="Frontend Engineer, React Developer"
            />
          </label>
          <label className="flex flex-[1.3_1_11rem] flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em]">Location</span>
            <Input
              className="input-pill min-h-[50px]"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pune, IN"
            />
          </label>
          <Button
            onClick={search}
            disabled={pending}
            busy={pending}
            className="min-h-[50px] flex-none px-[26px]"
          >
            <Search className="lucide h-[17px] w-[17px]" />
            {pending ? "Searching…" : "Search"}
          </Button>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-bold">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
              className="h-6 w-6 accent-[var(--color-text)]"
            />
            Remote only
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em]">Posted within</span>
            <div className="seg seg-wrap" role="radiogroup" aria-label="Posted within">
              {POSTED_WITHIN_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  role="radio"
                  aria-checked={postedWithin === days}
                  aria-selected={postedWithin === days}
                  onClick={() => setPostedWithin(days)}
                >
                  {windowLabel(days)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Deep links, not results (lib/domain/job-portals.ts) — nothing here
            was fetched, matched or triaged, so it carries no skill chip and no
            "Sources:" attribution the way a real JobSource's listings do. */}
        <div className="mt-[18px] flex flex-wrap items-center gap-2 border-t-[1.5px] border-[rgb(74_13_13/0.18)] pt-4">
          <span className="mr-1 text-[13px]">
            Or search directly — opens their own results, not run through Roleform:
          </span>
          {JOB_PORTALS.map((portal) => (
            <a
              key={portal.id}
              href={portal.url(portalQuery)}
              target="_blank"
              rel="noopener nofollow"
              className="btn btn-secondary btn-sm min-h-[34px] px-3.5 text-[13px] no-underline"
            >
              {portal.label} <ExternalLink className="lucide h-3 w-3" />
            </a>
          ))}
        </div>
      </div>

      {error ? <ErrorRegion title="That search didn't come back">{error}</ErrorRegion> : null}

      {results ? (
        <section aria-label="Search results">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[40px] leading-none">
              {results.total} listing{results.total === 1 ? "" : "s"}
            </h2>
            <p className="text-[14px] text-[var(--color-text-muted)]">
              {results.newCount > 0 ? `${results.newCount} new since your last search · ` : ""}
              Posted within {windowLabel(results.postedWithinDays).toLowerCase()}
              {results.fromCache
                ? ` · from your search on ${new Date(results.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                : ""}
            </p>
          </div>

          {results.attributions.length > 0 ? (
            <p className="mb-3 text-[13px] text-[var(--color-text-muted)]">
              Sources:{" "}
              {results.attributions.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? " · " : ""}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          ) : null}

          {results.health.length > 0 ? (
            <div className="note mb-5" role="status">
              <ul className="space-y-1 text-[14px]">
                {results.health.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {results.gaps.length > 0 ? (
            <Card flat className="mb-6 px-6 py-5">
              <p className="eyebrow mb-2">Asked for, not on your profile</p>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {results.gaps.map((gap) => (
                  <Tag key={gap.skill} tone="pink">
                    {gap.skill} · {gap.listings} listings
                  </Tag>
                ))}
              </div>
              <p className="max-w-[64ch] text-[14px] leading-relaxed text-[var(--color-text-muted)]">
                Skills these listings keep naming that your profile doesn&rsquo;t. Analyse one of them
                and its Learning tab plans how to close the gap — nothing is added to your profile
                until you add it.
              </p>
            </Card>
          ) : null}

          {results.total === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Nothing came back for this query. Try widening the window, the location or the titles.
            </p>
          ) : (
            <>
              <div data-help="job-tiers" className="seg seg-wrap mb-3" role="tablist" aria-label="Triage tiers">
                {results.tiers.map((t) => (
                  <button
                    key={t.tier}
                    type="button"
                    role="tab"
                    aria-selected={t.tier === shownTier}
                    onClick={() => setTier(t.tier)}
                  >
                    {t.label}
                    <span className="seg-count">{t.cards.length}</span>
                  </button>
                ))}
              </div>
              {shownTier ? (
                <p className="mb-5 max-w-[70ch] text-[14px] text-[var(--color-text-muted)]">{TIER_NOTE[shownTier]}</p>
              ) : null}

              {shownCards.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">Nothing in this tier for this search.</p>
              ) : (
                <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
                  {shownCards.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      saved={savedIds.has(listing.id) || listing.saved !== null}
                      onSave={() => save(listing.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ageLabel(days: number | null): string {
  if (days === null) return "Date unknown";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function ListingCard({
  listing,
  saved,
  onSave,
}: {
  listing: ListingCardView;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 px-6 py-[22px]">
      <div className="flex flex-wrap items-center gap-1.5">
        {listing.isNew ? <Tag tone="accent">New</Tag> : null}
        {listing.saved ? (
          <Tag tone="ink" className="capitalize">
            {listing.saved.status === "saved" ? "Saved" : listing.saved.status}
          </Tag>
        ) : null}
        <span className="text-[12.5px] text-[var(--color-text-muted)]">
          {listing.sourceLabel} · {ageLabel(listing.ageDays)}
        </span>
      </div>

      <div className="min-w-0">
        <h3 className="mb-1 text-[19px]">{listing.title}</h3>
        <p className="text-[14.5px] text-[var(--color-text-muted)]">
          {listing.company || "—"} · {listing.location || "—"}
          {listing.salary ? ` · ${listing.salary}` : ""}
        </p>
        {listing.alsoIn.length > 0 ? (
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            Also posted in {listing.alsoIn.slice(0, 3).join(", ")}
            {listing.alsoIn.length > 3 ? ` and ${listing.alsoIn.length - 3} more` : ""}
          </p>
        ) : null}
        {listing.alsoVia.length > 0 ? (
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">Also listed on {listing.alsoVia.join(", ")}</p>
        ) : null}
      </div>

      {listing.strengths.length > 0 || listing.cautions.length > 0 ? (
        <ul className="space-y-1 text-[14px]">
          {listing.strengths.map((s) => (
            <li key={s} className="flex items-start gap-2">
              <Check className="lucide mt-[3px] h-3.5 w-3.5 flex-none" aria-hidden />
              <span>{s}</span>
            </li>
          ))}
          {listing.cautions.map((c) => (
            <li key={c} className="flex items-start gap-2 text-[var(--color-accent-700)]">
              <AlertTriangle className="lucide mt-[3px] h-3.5 w-3.5 flex-none" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {listing.matchedSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[13px] text-[var(--color-text-muted)]">Your skills it names:</span>
          {listing.matchedSkills.map((skill) => (
            <Tag key={skill} tone="outline">
              {skill}
            </Tag>
          ))}
        </div>
      ) : null}

      {listing.askedSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[13px] text-[var(--color-text-muted)]">Asks for, not on your profile:</span>
          {listing.askedSkills.slice(0, 8).map((skill) => (
            <Tag key={skill} tone="muted">
              {skill}
            </Tag>
          ))}
          {listing.askedSkills.length > 8 ? (
            <span className="text-[13px] text-[var(--color-text-muted)]">+{listing.askedSkills.length - 8}</span>
          ) : null}
        </div>
      ) : null}

      <p className="line-clamp-3 text-[14.5px] leading-normal text-[var(--color-text-muted)]">{listing.snippet}</p>

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <a href={listing.url} target="_blank" rel="noopener nofollow" className="btn btn-secondary btn-sm no-underline">
          Open <ExternalLink className="lucide h-3.5 w-3.5" />
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          disabled={saved}
          className={saved ? "bg-[var(--color-accent-200)] disabled:opacity-100" : "bg-[var(--color-chip)]"}
        >
          {saved ? "Saved" : "Save"}
        </Button>
        <Link href={`/analyze?listing=${listing.id}`} className="btn btn-ghost btn-sm no-underline">
          {listing.hasFullPosting ? "Analyse full posting" : "Analyse"}
        </Link>
      </div>

      {listing.contacts ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-[1.5px] border-[rgb(74_13_13/0.12)] pt-2.5 text-[13px]">
          <Users className="lucide h-3.5 w-3.5" aria-hidden />
          <a href={listing.contacts.recruiters} target="_blank" rel="noopener nofollow" className="font-bold">
            Find a recruiter there
          </a>
          <a href={listing.contacts.team} target="_blank" rel="noopener nofollow" className="font-bold">
            People in this role
          </a>
          <span className="text-[var(--color-text-muted)]">LinkedIn searches — opened by you, nothing fetched</span>
        </div>
      ) : null}
    </Card>
  );
}
