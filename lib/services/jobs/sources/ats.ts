/**
 * The shared half of the Greenhouse, Lever and Ashby adapters (F22.2).
 *
 * Each of these APIs returns one employer's WHOLE board — hundreds of
 * postings, megabytes with descriptions — and has no keyword search. So:
 *
 *   - a board is fetched once per server instance and kept for 30 minutes,
 *     and concurrent requests for the same board share one in-flight fetch:
 *     three keyword variants, or ten members searching at once, cost one
 *     request per board, not thirty;
 *   - the board fetch runs on its own 7.5s clock, not the caller's, so one
 *     search giving up never poisons the shared fetch another is waiting on;
 *   - filtering is ours (`boardPostingFits`, PURE) over what the employer
 *     published;
 *   - a board that fails is counted, not hidden: the source reports how many
 *     of its boards didn't answer (R28).
 *
 * Nothing here is a scrape (N17): all three are the vendors' documented,
 * public, keyless job-board APIs.
 */
import "server-only";
import { boardPostingFits, type BoardPosting } from "@/lib/domain/board-filter";
import { boardsFor, type Ats, type Board } from "./ats-boards";
import { emptyRun, fetchJson, parseListings, type JobQuery, type SourceRun } from "./types";

const BOARD_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;
const BOARD_TIMEOUT_MS = 7_500;
/** Per keyword variant, per source. `runSearch` still caps the whole search at 50. */
export const MAX_PER_VARIANT = 25;

type Fetched = { body: unknown } | { failure: NonNullable<SourceRun["failure"]> };

/** Enough for every curated board plus the posting details recent searches enriched. */
const CACHE_MAX = 600;
const cache = new Map<string, { at: number; value: Fetched }>();
const inFlight = new Map<string, Promise<Fetched>>();

/** One shared, cached GET. Failures are cached briefly so a dead board isn't hammered. */
export function cachedJson(url: string): Promise<Fetched> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ("failure" in hit.value ? FAILURE_TTL_MS : BOARD_TTL_MS)) {
    return Promise.resolve(hit.value);
  }
  const running = inFlight.get(url);
  if (running) return running;

  const p = fetchJson(url, {
    signal: AbortSignal.timeout(BOARD_TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "roleform/1.0 (+https://roleform.koustubh.org)" },
  })
    .then((value) => {
      // Map iteration is insertion order: the first key is the oldest entry.
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(url, { at: Date.now(), value });
      return value;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, p);
  return p;
}

/** Waits for `p`, but gives up when the caller's signal aborts — without cancelling `p` for anyone else. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T | "aborted"> {
  if (signal.aborted) return Promise.resolve("aborted");
  return new Promise((resolve) => {
    const onAbort = () => resolve("aborted");
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      () => resolve("aborted"),
    );
  });
}

/** A board posting as an adapter maps it: the filter's facts plus the schema's fields. */
export type BoardCandidate = BoardPosting & Record<string, unknown>;

export interface AtsAdapterSpec {
  ats: Ats;
  boardUrl(board: Board): string;
  /** The board's raw body → candidates. Throwing is not allowed; return [] instead. */
  toCandidates(board: Board, body: unknown): BoardCandidate[];
  /** Optional second step for the postings that passed the filter (Greenhouse content). */
  enrich?(board: Board, matches: BoardCandidate[], signal: AbortSignal): Promise<BoardCandidate[]>;
}

export async function searchBoards(
  spec: AtsAdapterSpec,
  keywords: string,
  query: JobQuery,
  signal: AbortSignal,
): Promise<SourceRun> {
  const boards = boardsFor(spec.ats);
  if (!keywords || boards.length === 0) return emptyRun();

  const results = await Promise.all(
    boards.map(async (board) => ({ board, got: await untilAborted(cachedJson(spec.boardUrl(board)), signal) })),
  );

  let failedBoards = 0;
  let lastFailure: SourceRun["failure"] = null;
  const matches: Array<{ board: Board; candidate: BoardCandidate }> = [];
  for (const { board, got } of results) {
    if (got === "aborted") {
      failedBoards++;
      lastFailure = { kind: "timeout" };
      continue;
    }
    if ("failure" in got) {
      failedBoards++;
      lastFailure = got.failure;
      continue;
    }
    for (const candidate of spec.toCandidates(board, got.body)) {
      if (boardPostingFits(candidate, keywords, query)) matches.push({ board, candidate });
    }
  }

  // Newest first before the cap, so a big board's old postings can't crowd
  // out a small board's fresh ones.
  matches.sort((a, b) => String(b.candidate.postedAt ?? "").localeCompare(String(a.candidate.postedAt ?? "")));
  const kept = matches.slice(0, MAX_PER_VARIANT);

  let candidates = kept.map((m) => m.candidate);
  if (spec.enrich) {
    const byBoard = new Map<Board, BoardCandidate[]>();
    for (const m of kept) byBoard.set(m.board, [...(byBoard.get(m.board) ?? []), m.candidate]);
    candidates = (await Promise.all([...byBoard].map(([board, list]) => spec.enrich!(board, list, signal)))).flat();
  }

  const { listings, dropped } = parseListings(candidates);
  return {
    listings,
    dropped,
    closed: 0,
    // The source failed only if every board did; otherwise it's a partial
    // result, and the board counts say so.
    failure: failedBoards === boards.length ? lastFailure : null,
    boards: { failed: failedBoards, total: boards.length },
  };
}
