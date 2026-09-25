"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { Button, Card, ErrorRegion, Input, Tag, Textarea } from "@/components/ui";
import { CapWallDialog } from "@/components/cap-wall";
import { searchJobs, saveJob } from "@/app/actions/jobs";
import type { JobQuery } from "@/lib/domain/job-query";
import type { SearchListingView, SearchOutcome } from "@/lib/jobs/search";
import type { CapWall } from "@/lib/domain/quotas";
import { JOB_PORTALS } from "@/lib/domain/job-portals";
import { MAX_DESCRIPTION_CHARS } from "@/lib/domain/job-intent";

/**
 * The query editor and results (F22). Fit is shown as named skill chips —
 * "mentions 3 of your skills" — never a score, a ring or the word "match"
 * (N20). Every result's Open link is the provider's own `url`, untouched.
 */
export function JobSearchClient({ baseQuery }: { baseQuery: JobQuery }) {
  const router = useRouter();
  const [titles, setTitles] = useState(baseQuery.titles.join(", "));
  const [location, setLocation] = useState(baseQuery.location);
  const [remote, setRemote] = useState(baseQuery.remote);
  // Two ways in: the titles/location boxes, or a sentence the server parses
  // into the same fields (lib/domain/job-intent.ts).
  const [mode, setMode] = useState<"titles" | "describe">("titles");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capWall, setCapWall] = useState<CapWall | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchJobs(
        mode === "describe"
          ? { description, location, remote }
          : {
              titles: titles
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
              location,
              remote,
            },
      );
      if (!result.ok) {
        if (result.error.capWall) setCapWall(result.error.capWall);
        else setError(result.error.message);
        return;
      }
      setOutcome(result.value);
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

  const configuredSources = outcome?.sourcesQueried.filter((s) => s.configured) ?? [];

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

      <div className="mb-7 rounded-[var(--radius-xl)] bg-[var(--color-accent-500)] p-[clamp(1.25rem,2.6vw,1.9rem)]">
        <div role="tablist" aria-label="Search by" className="mb-4 inline-flex gap-1 rounded-[var(--radius-pill)] border-[1.5px] border-[var(--color-text)] p-1">
          {(
            [
              ["titles", "By title"],
              ["describe", "Describe it"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-9 rounded-[var(--radius-pill)] px-4 text-sm font-bold ${
                mode === value ? "bg-[var(--color-text)] text-[var(--color-accent-500)]" : ""
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "describe" ? (
          <label className="mb-3 flex flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em]">What are you looking for?</span>
            <Textarea
              className="min-h-[92px] rounded-[var(--radius-lg)]"
              value={description}
              maxLength={MAX_DESCRIPTION_CHARS}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Senior React developer in Pune, TypeScript and Node, remote is fine"
            />
            <span className="text-[13px]">
              Only the role, skills, city and “remote” we pick out of this are searched — the sentence
              itself isn&rsquo;t sent anywhere or kept.
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          {mode === "titles" ? (
            <label className="flex flex-[2_1_16rem] flex-col gap-1.5">
              <span className="text-xs font-extrabold uppercase tracking-[0.06em]">Titles</span>
              <Input
                className="input-pill min-h-[50px]"
                value={titles}
                onChange={(e) => setTitles(e.target.value)}
                placeholder="Frontend Engineer, React Developer"
              />
            </label>
          ) : null}
          <label className="flex flex-[1.3_1_11rem] flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em]">Location</span>
            <Input
              className="input-pill min-h-[50px]"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Pune"
            />
          </label>
          <Button
            onClick={search}
            disabled={pending || (mode === "describe" && !description.trim())}
            busy={pending}
            className="min-h-[50px] flex-none px-[26px]"
          >
            <Search className="lucide h-[17px] w-[17px]" />
            {pending ? "Searching…" : "Search"}
          </Button>
        </div>
        <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 text-[15px] font-bold">
          <input
            type="checkbox"
            checked={remote}
            onChange={(e) => setRemote(e.target.checked)}
            className="h-6 w-6 accent-[var(--color-text)]"
          />
          Remote only
        </label>

        {/* Deep links, not results (lib/domain/job-portals.ts) — nothing here
            was fetched, matched or scored, so it carries no skill chip and no
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

      {outcome ? (
        <>
          <p className="mb-2 text-[13px]">
            <span className="font-bold">Searched for:</span>{" "}
            {[
              ...outcome.searched.titles.slice(0, 1),
              ...outcome.searched.keywords,
              outcome.searched.location,
              outcome.searched.remote ? "Remote" : "",
            ]
              .filter(Boolean)
              .join(" · ") || "your profile's skills"}
          </p>
          {configuredSources.length > 0 ? (
            <p className="mb-4 text-[13px] text-[var(--color-text-muted)]">
              {outcome.fromCache ? "From your last search · " : ""}
              Sources:{" "}
              {configuredSources.map((s, i) => (
                <span key={s.id}>
                  {i > 0 ? " · " : ""}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {s.label}
                  </a>
                </span>
              ))}
            </p>
          ) : (
            <p className="mb-4 text-xs text-[var(--color-text-muted)]">
              No job source is configured on this deployment yet.
            </p>
          )}

          {outcome.listings.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Nothing came back for this query. Try widening the location or titles.
            </p>
          ) : (
            <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(420px,100%),1fr))]">
              {outcome.listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  saved={savedIds.has(listing.id)}
                  onSave={() => save(listing.id)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ListingCard({
  listing,
  saved,
  onSave,
}: {
  listing: SearchListingView;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 px-6 py-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="mb-1 text-[19px]">{listing.title}</h3>
          <p className="text-[14.5px] text-[var(--color-text-muted)]">
            {listing.company || "—"} · {listing.location || "—"}
          </p>
        </div>
      </div>

      {listing.matchedSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[13px] text-[var(--color-text-muted)]">
            Mentions {listing.matchedSkills.length} of your skills:
          </span>
          {listing.matchedSkills.map((skill) => (
            <Tag key={skill} tone="outline">
              {skill}
            </Tag>
          ))}
        </div>
      ) : null}

      <p className="line-clamp-2 text-[14.5px] leading-normal text-[var(--color-text-muted)]">
        {listing.snippet}
      </p>

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
          Analyse
        </Link>
      </div>
    </Card>
  );
}
