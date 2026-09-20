"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { Button, Card, ErrorRegion, Input, Tag } from "@/components/ui";
import { CapWallDialog } from "@/components/cap-wall";
import { searchJobs, saveJob } from "@/app/actions/jobs";
import type { JobQuery } from "@/lib/domain/job-query";
import type { SearchListingView, SearchOutcome } from "@/lib/jobs/search";
import type { CapWall } from "@/lib/domain/quotas";
import { JOB_PORTALS } from "@/lib/domain/job-portals";

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
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
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
      });
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

      <Card className="mb-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1.3fr_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
              Titles
            </span>
            <Input
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              placeholder="Frontend Engineer, React Developer"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
              Location
            </span>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Pune" />
          </label>
          <div className="flex items-end">
            <Button onClick={search} disabled={pending} busy={pending} className="w-full sm:w-auto">
              <Search className="lucide h-4 w-4" />
              {pending ? "Searching…" : "Search"}
            </Button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
          Remote only
        </label>

        {/* Deep links, not results (lib/domain/job-portals.ts) — nothing here
            was fetched, matched or scored, so it carries no skill chip and no
            "Sources:" attribution the way a real JobSource's listings do. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
          <span className="text-xs text-[var(--color-text-muted)]">
            Or search directly — opens their own results, not run through Roleform:
          </span>
          {JOB_PORTALS.map((portal) => (
            <a
              key={portal.id}
              href={portal.url(portalQuery)}
              target="_blank"
              rel="noopener nofollow"
              className="btn btn-ghost btn-sm no-underline"
            >
              {portal.label} <ExternalLink className="lucide h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </Card>

      {error ? <ErrorRegion title="That search didn't come back">{error}</ErrorRegion> : null}

      {outcome ? (
        <>
          {configuredSources.length > 0 ? (
            <p className="mb-4 text-xs text-[var(--color-text-muted)]">
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
            <div className="space-y-3">
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
    <Card className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.05rem]">{listing.title}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            {listing.company || "—"} · {listing.location || "—"}
          </p>
        </div>
      </div>

      {listing.matchedSkills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">
            Mentions {listing.matchedSkills.length} of your skills:
          </span>
          {listing.matchedSkills.map((skill) => (
            <Tag key={skill} tone="sage">
              {skill}
            </Tag>
          ))}
        </div>
      ) : null}

      <p className="line-clamp-2 text-sm text-[var(--color-text-muted)]">{listing.snippet}</p>

      <div className="flex flex-wrap gap-2 pt-1">
        <a href={listing.url} target="_blank" rel="noopener nofollow" className="btn btn-secondary btn-sm no-underline">
          Open <ExternalLink className="lucide h-3.5 w-3.5" />
        </a>
        <Button variant="ghost" size="sm" onClick={onSave} disabled={saved}>
          {saved ? "Saved" : "Save"}
        </Button>
        <Link href={`/analyze?listing=${listing.id}`} className="btn btn-ghost btn-sm no-underline">
          Analyse
        </Link>
      </div>
    </Card>
  );
}
