/**
 * Is this URL dead, or is it just refusing us?
 *
 * ── Why this distinction has to exist ───────────────────────────────────────
 * The catalog's rule is that a link which does not resolve never enters the
 * database, so the Learning tab cannot serve a 404 (N8). That rule was
 * implemented as "anything that isn't 2xx is dead", and it was quietly wrong:
 * of six URLs the first seed rejected, only two were actually gone. Three were
 * live resources whose hosts return 403 to a non-browser User-Agent, and one
 * was a transient failure that returned 200 on the next request.
 *
 * Excluding a live resource is not a safe failure. It shrinks coverage
 * invisibly, pushes real gaps onto roadmap fallbacks, and looks identical to
 * "the catalog never had anything for this skill" — so nobody ever investigates.
 *
 * Three outcomes, because there are three different things to do about them:
 *
 *   live     2xx (or 3xx to one)     → seed it
 *   dead     404 / 410               → the resource is GONE. Never seed it.
 *   blocked  401 / 403 / 429 / error → the host refused US, not the world.
 *                                      Seed it, and report it for a human to
 *                                      open in a browser once.
 *
 * `blocked` is deliberately not silent. A bot-wall and a resource that has been
 * taken down behind one are indistinguishable from here, so the honest answer is
 * to keep serving it and say out loud that we could not confirm it.
 */

import type { ResourceType } from "./quality";

export type Liveness = "live" | "dead" | "blocked";

/** Hosts answer these when they mean "not you", not "not here". */
const REFUSAL_CODES = new Set([401, 403, 405, 406, 429, 503]);

/** These mean the resource is genuinely gone. Nothing else does. */
const GONE_CODES = new Set([404, 410]);

/**
 * A real browser's UA. Not evasion — the check is announced by
 * `X-Roleform-Check`, it requests one page, and it obeys the response. It is
 * here because several documentation hosts serve a WAF challenge to anything
 * that doesn't look like a browser, and a WAF challenge is not evidence that a
 * tutorial has been deleted.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function checkLiveness(url: string): Promise<Liveness> {
  let sawGoneOnGet = false;

  for (const method of ["HEAD", "GET"] as const) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": BROWSER_UA, "X-Roleform-Check": "catalog-liveness" },
      });

      if (response.ok) return "live";

      // ★ Only a GET can conclude "dead".
      //
      // This originally treated 404 as conclusive on either method, on the
      // reasoning that nothing serves 404 to a HEAD and 200 to a GET. Kaggle
      // does exactly that: `HEAD https://www.kaggle.com/learn` → 404,
      // `GET` → 200. The check was therefore deleting a live resource from the
      // catalog on the strength of a request the host never meant to answer.
      //
      // HEAD is kept because it is cheap and a 2xx from it is still conclusive
      // proof of life. It is simply not allowed to convict.
      if (GONE_CODES.has(response.status)) {
        if (method === "GET") sawGoneOnGet = true;
        continue;
      }

      // Refusals and anything else non-2xx: not evidence of deletion.
      if (REFUSAL_CODES.has(response.status)) continue;
    } catch {
      // Timeouts and transport errors are the network's problem, not the
      // resource's. One of the first six false positives was exactly this.
      continue;
    }
  }

  return sawGoneOnGet ? "dead" : "blocked";
}

/* ── YouTube ─────────────────────────────────────────────────────────────────
 * The watch page is a consent wall and a bot-wall for non-browsers, so HEAD/GET
 * on it proves nothing. oEmbed is YouTube's documented, keyless endpoint for
 * exactly this question (N17): it answers about the video, and it names the
 * channel, which is how the dry check catches a mis-attributed `author`.
 *
 *   200       live, author_name reported
 *   401/403   live — the video exists, its owner disabled embedding
 *   400/404   dead — unknown or removed (private videos answer 401/403 too;
 *             that is "exists", and a human will notice on first play)
 *   anything else (429, 5xx, network) → blocked: YouTube refused us, not the world
 */

export type LinkCheck = { liveness: Liveness; authorName: string | null };

export async function checkVideo(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkCheck> {
  try {
    const response = await fetchImpl(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(20_000), headers: { "X-Roleform-Check": "catalog-liveness" } },
    );
    if (response.status === 200) {
      let authorName: string | null = null;
      try {
        const body = (await response.json()) as { author_name?: unknown };
        if (typeof body.author_name === "string") authorName = body.author_name;
      } catch {
        // A 200 with an unreadable body is still a live video.
      }
      return { liveness: "live", authorName };
    }
    if (response.status === 401 || response.status === 403) {
      return { liveness: "live", authorName: null };
    }
    if (response.status === 400 || response.status === 404) {
      return { liveness: "dead", authorName: null };
    }
    return { liveness: "blocked", authorName: null };
  } catch {
    return { liveness: "blocked", authorName: null };
  }
}

function isYouTube(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
    return host === "youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

/** Videos and playlists on YouTube go through oEmbed; everything else through `checkLiveness`. */
export async function checkCourseLink(
  def: { url: string; type: ResourceType },
  fetchImpl: typeof fetch = fetch,
): Promise<LinkCheck> {
  if (isYouTube(def.url)) return checkVideo(def.url, fetchImpl);
  return { liveness: await checkLiveness(def.url), authorName: null };
}
