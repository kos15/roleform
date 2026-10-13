"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * What a crashed screen shows instead of Next's bare "Application error: a
 * client-side exception has occurred" — which is what every one of them showed
 * before, because no route had an error boundary at all.
 *
 * Two kinds of crash reach here and they want different things:
 *
 * - **A stale tab.** After a deploy, a page loaded from the previous build asks
 *   for script chunks and Server Actions that no longer exist. Nothing is wrong
 *   with the page except its age, and one reload fixes it — so it reloads by
 *   itself, at most once a minute so a genuinely broken build can't loop.
 * - **Anything else.** A server render that threw, an action that failed in
 *   flight. "Try again" re-fetches the server half before re-rendering, which
 *   is what a plain `reset()` alone would skip.
 *
 * N7: nothing is logged except the error's digest (a server-side reference,
 * no content) and its name.
 */
export function RouteError({
  error,
  reset,
  homeHref = "/analyze",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref?: string;
}) {
  const router = useRouter();
  const stale = isStaleDeployment(error);

  useEffect(() => {
    console.error(`[route-error] name=${error.name} digest=${error.digest ?? "none"}`);
    if (stale && reloadOnce()) window.location.reload();
  }, [error, stale]);

  return (
    <div className="max-w-[760px] py-[clamp(1rem,4vw,3rem)]">
      <p className="eyebrow mb-3.5">{stale ? "Updated" : "Something went wrong"}</p>
      <h1 className="mb-5 text-[clamp(2.5rem,5vw,4.25rem)] leading-[0.92]">
        {stale ? "Roleform was just updated" : "This screen didn’t load"}
      </h1>
      <p className="mb-8 max-w-[56ch] text-[17px] leading-relaxed text-[var(--color-text-muted)]">
        {stale
          ? "This tab is from the previous version. Reloading brings it up to date — nothing you saved is lost."
          : "Nothing you saved is lost. It is usually a dropped connection; trying again almost always works."}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {/* The DS classes directly rather than <Button>: these boundaries ship
            in every page's bundle, so they stay as small as they can. */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (stale) {
              window.location.reload();
              return;
            }
            startTransition(() => {
              router.refresh();
              reset();
            });
          }}
        >
          {stale ? "Reload" : "Try again"}
        </button>
        {/* A full page load rather than <Link>: after a crash, a fresh
            document is the surer way out, and it keeps next/link out of
            every boundary's chunk. */}
        <a href={homeHref} className="btn btn-secondary no-underline">
          {homeHref === "/" ? "Go home" : "Start a new analysis"}
        </a>
      </div>
    </div>
  );
}

/**
 * The messages a browser or Next gives when a tab outlives its deployment:
 * a chunk that 404s, a dynamic import that fails, a Server Action id the new
 * build doesn't have.
 */
export function isStaleDeployment(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|Failed to find Server Action|older or newer deployment/i.test(
    text,
  );
}

const RELOAD_KEY = "roleform-stale-reload";

/** True when no automatic reload happened in the last minute (and records this one). */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    // No storage: we can't tell a first reload from a loop, so don't start one.
    return false;
  }
}
