# Progressive results plan

**Goal.** The score, the three buckets and every tab appear about 15s after submit. Résumé drafts land about 30s at p50, with a loader on each tab. The Résumés tab gets a read-only "Still not evidenced" panel that links to Learning and inserts nothing into any draft (N1, N3, §3).

**Architecture.** The pipeline writes `status: "ready"` in the score update after stage ② on both the fresh and the resumed path, then emits `matching done`. The parsing screen finishes on that event. Stages ③–⑤ keep running inside `after()` while the run's claim (`runningAt`) is held. Whether drafts are pending, ready, missing or off is worked out on read by the pure `draftsState`; nothing new is stored. Tailoring and page measuring use one ordered `mapLimit` helper. Drafts are written in one batch `$transaction` with ids made by the app. Tailoring has a 180s start deadline and writes one log line of counts per run.

**Global constraints.**
- §11: every behaviour change starts with a failing Vitest test.
- N1: `tailored_bullets.source_bullet_id` stays NOT NULL.
- N3 and §3: the panel only reads coverage and inserts nothing into drafts.
- N4: the score never renders without its buckets. Only the timing of the header changes.
- N7: logs carry counts and identifiers only.
- N9: marigold DS classes and tokens only, no hex and no ad-hoc radius.
- §5: never write a fixed draft count into copy.
- §10: `lib/domain` imports no I/O.
- §13: use the fixed vocabulary (`ResumeDraft`, `TailoredBullet`, `SkillGap`).
- No Prisma schema change. No migration. No runtime environment override for the model.
- Batch-form `$transaction([...])` only. pgbouncer rules out an interactive transaction.

## PENDING.md lines to add

```
### Progressive results — `docs/superpowers/plans/2026-10-26-progressive-results.md` (branch `feat/progressive-results`)

- [ ] Task 1: `mapLimit(items, n, fn)` ordered concurrency helper in `lib/shared/utils.ts`
- [ ] Task 2: pure `blockCause` · `buildChangeList` · `tailorTally` in `lib/domain/diff.ts` (stopped-partway notice moves into draft.changes; ceiling/deadline/transient never counted as "rejected for adding detail")
- [ ] Task 3: pure `draftsState` in `lib/services/pipeline/background.ts`
- [ ] Task 4: pure `parsingFinished` in `lib/services/pipeline/stages.ts`
- [ ] Task 5: pure `stillNotEvidenced` in `lib/domain/coverage.ts`
- [ ] Task 6: pipeline writes `ready` in the score update on both paths, before `matching done`; later ready update deleted
- [ ] Task 7: pipeline skips stage ③ when the member's draft cap is 0
- [ ] Task 8: writeDrafts — app-made uuids, pages via mapLimit(4), one batch `$transaction`, `[pipeline] pages` log
- [ ] Task 9: tailoring via mapLimit — TAILOR_CONCURRENCY=10, 180s start deadline, per-run `[pipeline] tailor` count log
- [ ] Task 10: parsing screen finishes on `parsingFinished`, two pips, "Your results are ready"; route.ts comment
- [ ] Task 11: Résumés tab count reads "Preparing…" while drafts are generating
- [ ] Task 12: `DraftsPlaceholder` (pending · missing + "Finish the drafts" · off) and the "Still not evidenced" panel on the Résumés tab; preview pending state
- [ ] Task 13: runAgent starts the Jev injection check concurrently with the model call (fail open)
- [ ] Task 14: `pnpm eval bullet-tailor --role writer|writer-fast` (script-only model override)
- [ ] Task 15: docs — specs §8 flow, F3, F5, F14 (stalled-run behaviour change)
- [ ] Task 16 (T-final): flip `tailor_bullet` to writer-fast + specs §10 — ONLY after the fabrication eval passes on `--role writer-fast`
```

---

### Task 1: `mapLimit`, an ordered concurrency helper

**Files.**
- Modify `lib/shared/utils.ts`.
- Create `tests/shared/utils.test.ts`.

**Interfaces.** Produces:
```ts
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]>
```
Semantics:
- Results come back in input order.
- At most `max(1, floor(limit))` calls are in flight.
- The first `limit` calls start synchronously, before any of them resolves.
- After the first rejection no new item starts, and the promise rejects with that error.

- [ ] **Step 1: failing tests** in `tests/shared/utils.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { mapLimit } from "@/lib/shared/utils";
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("returns results in input order whatever order they finish in", async () => {
    expect(await mapLimit([30, 10, 20], 3, async (ms, i) => { await tick(ms); return `${i}:${ms}`; }))
      .toEqual(["0:30", "1:10", "2:20"]);
  });
  it("runs at most `limit` at once and starts `limit` before any finishes", async () => {
    let inFlight = 0, peak = 0, finished = 0, early = 0;
    await mapLimit(Array.from({ length: 9 }, (_, i) => i), 4, async () => {
      inFlight++; peak = Math.max(peak, inFlight); if (finished === 0) early++;
      await tick(5); inFlight--; finished++;
    });
    expect(peak).toBe(4);
    expect(early).toBe(4);
  });
  it("returns [] for no items without calling fn", async () => {
    const fn = vi.fn();
    expect(await mapLimit([], 3, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
  it("rejects with the first error and starts nothing after it", async () => {
    const started: number[] = [];
    await expect(mapLimit([0, 1, 2, 3, 4], 1, async (x) => { started.push(x); if (x === 1) throw new Error("boom"); }))
      .rejects.toThrow("boom");
    await tick(5);
    expect(started).toEqual([0, 1]);
  });
  it("treats a limit below 1 as 1", async () => {
    let inFlight = 0, peak = 0;
    await mapLimit([1, 2, 3], 0, async () => { inFlight++; peak = Math.max(peak, inFlight); await tick(1); inFlight--; });
    expect(peak).toBe(1);
  });
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/shared/utils.test.ts`. Expect FAIL with `TypeError: mapLimit is not a function` or an import error.
- [ ] **Step 3: implement.** Use N workers over a shared `next` index. Each worker runs `while (!failed && next < items.length) { const i = next++; try { out[i] = await fn(items[i], i) } catch (e) { failed = true; throw e } }`. Then `await Promise.all(workers)`. Add a 3-line doc comment saying results are ordered and no new start follows a rejection.
- [ ] **Step 4:** the test passes. Then `pnpm test` and `pnpm -s typecheck` are green.
- [ ] **Step 5:** hand to jiraiya with `feat(shared): add ordered mapLimit concurrency helper`.

### Task 2: pure change list and tailoring tally

**Files.**
- Modify `lib/domain/diff.ts`.
- Create `tests/domain/diff.test.ts`.

**Interfaces.** Produces, in `lib/domain/diff.ts` (import `Transform` from `./types`):
```ts
export interface TailorOutcome { originalText: string; rewrittenText: string; transform: Transform; blockedBy: string[] }
export type BlockCause = "checker" | "guard" | "ceiling" | "deadline" | "transient";
export function blockCause(blockedBy: readonly string[]): BlockCause | null
export const STOPPED_PARTWAY =
  "We stopped rewriting partway through — the rest of your bullets kept their original wording.";
export function buildChangeList(tailored: readonly TailorOutcome[]): string[]
export interface TailorTally { bullets: number; rewritten: number; verbatim: number; transient: number; checker: number; guard: number; ceiling: number; deadline: number }
export function tailorTally(tailored: readonly TailorOutcome[]): TailorTally
```

`blockCause` checks in this order and returns the first match:

| `blockedBy` | Result |
|---|---|
| empty | `null` |
| includes `"token_ceiling"` | `"ceiling"` |
| includes `"deadline"` | `"deadline"` |
| includes `"checker"` | `"checker"` |
| any entry contains `":"` (a fabrication finding such as `tool:Go`) | `"guard"` |
| anything else (`model_failed`, `schema_invalid`) | `"transient"` |

`buildChangeList` returns these lines, in order:
1. `summariseChanges(...)`.
2. `"Bullets reordered to lead with what the posting asks for most often."` if at least one transform is `rephrase` or `requantify`.
3. The existing "rejected" line, counting only `checker` and `guard`.
4. `STOPPED_PARTWAY` once, if any bullet is `ceiling` or `deadline`.

`tailorTally` fields:
- `rewritten` counts `rephrase` and `requantify`.
- `verbatim` counts `verbatim`.
- `omit` counts in neither.
- The cause fields come from `blockCause`.

- [ ] **Step 1: failing tests**:
```ts
import { describe, expect, it } from "vitest";
import { STOPPED_PARTWAY, blockCause, buildChangeList, tailorTally, type TailorOutcome } from "@/lib/domain/diff";
const t = (o: Partial<TailorOutcome> = {}): TailorOutcome =>
  ({ originalText: "Built X", rewrittenText: "Built X", transform: "verbatim", blockedBy: [], ...o });

describe("blockCause", () => {
  it.each([
    [[], null], [["checker"], "checker"], [["tool:Kubernetes", "metric:40%"], "guard"],
    [["model_failed"], "transient"], [["schema_invalid"], "transient"],
    [["token_ceiling"], "ceiling"], [["deadline"], "deadline"],
  ])("%j → %s", (b, want) => expect(blockCause(b as string[])).toBe(want));
});

describe("buildChangeList", () => {
  it("never calls a ceiling or deadline stop a rejection", () => {
    expect(buildChangeList([t({ blockedBy: ["token_ceiling"] }), t({ blockedBy: ["deadline"] })])).toEqual([
      "Nothing needed rewording — your bullets already match the posting's language.", STOPPED_PARTWAY]);
  });
  it("counts only checker and guard blocks as rejected for adding detail", () => {
    expect(buildChangeList([
      t({ rewrittenText: "Built X at pace", transform: "rephrase" }),
      t({ blockedBy: ["checker"] }), t({ blockedBy: ["tool:Go"] }),
      t({ blockedBy: ["model_failed"] }), t({ blockedBy: ["token_ceiling"] }),
    ])).toEqual([
      "1 of 5 bullets reworded to the posting's vocabulary; the rest kept verbatim.",
      "Bullets reordered to lead with what the posting asks for most often.",
      "2 rewrite(s) were rejected for adding detail you hadn't stated, and kept verbatim.",
      STOPPED_PARTWAY,
    ]);
  });
  it("says nothing about a transient failure beyond the verbatim count", () => {
    expect(buildChangeList([t({ blockedBy: ["model_failed"] })]))
      .toEqual(["Nothing needed rewording — your bullets already match the posting's language."]);
  });
});

describe("tailorTally", () => {
  it("counts outcomes and causes, never text", () => {
    expect(tailorTally([
      t({ transform: "rephrase", rewrittenText: "Built X fast" }), t({ blockedBy: ["checker"] }),
      t({ blockedBy: ["tool:Go"] }), t({ blockedBy: ["model_failed"] }),
      t({ blockedBy: ["token_ceiling"] }), t({ blockedBy: ["deadline"] }), t(), t({ transform: "omit" }),
    ])).toEqual({ bullets: 8, rewritten: 1, verbatim: 6, transient: 1, checker: 1, guard: 1, ceiling: 1, deadline: 1 });
  });
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/domain/diff.test.ts`. Expect FAIL with `blockCause is not a function`.
- [ ] **Step 3: implement** the four exports in `lib/domain/diff.ts`. Do not touch `run-analysis.ts` yet; Task 9 swaps the call.
- [ ] **Step 4:** the test passes. `pnpm test` and `pnpm -s typecheck` are green.
- [ ] **Step 5:** hand to jiraiya with `feat(domain): honest change list and tailoring tally`.

### Task 3: `draftsState`

**Files.**
- Modify `lib/services/pipeline/background.ts`.
- Create `tests/services/pipeline/background.test.ts`. This mirrors the layout of `tests/services/cron.test.ts`.

**Interfaces.**
```ts
export type DraftsState = "pending" | "ready" | "missing" | "off";
export function draftsState(
  analysis: { status: string; runningAt: Date | null },
  draftCount: number,
  cap: number,
): DraftsState
```
Rules, checked in this order:
1. `draftCount > 0` → `"ready"`.
2. `cap === 0` → `"off"`.
3. `backgroundRunning(analysis)` → `"pending"`.
4. Otherwise → `"missing"`.

- [ ] **Step 1: failing tests**:
```ts
import { describe, expect, it } from "vitest";
import { RUN_LOCK_STALE_MS, draftsState } from "@/lib/services/pipeline/background";
const live = () => new Date(Date.now() - 1_000);
const stale = () => new Date(Date.now() - RUN_LOCK_STALE_MS - 1_000);
describe("draftsState", () => {
  it("is ready whenever drafts exist, even after a cap change", () => {
    expect(draftsState({ status: "ready", runningAt: live() }, 3, 3)).toBe("ready");
    expect(draftsState({ status: "ready", runningAt: null }, 2, 0)).toBe("ready");
  });
  it("is off when the cap is 0 and none exist", () =>
    expect(draftsState({ status: "ready", runningAt: live() }, 0, 0)).toBe("off"));
  it("is pending while the run holds a live claim", () =>
    expect(draftsState({ status: "ready", runningAt: live() }, 0, 3)).toBe("pending"));
  it("is missing once the claim is released or stale", () => {
    expect(draftsState({ status: "ready", runningAt: null }, 0, 3)).toBe("missing");
    expect(draftsState({ status: "ready", runningAt: stale() }, 0, 3)).toBe("missing");
  });
  it("is missing, not pending, for a run that is not ready", () =>
    expect(draftsState({ status: "parsing", runningAt: live() }, 0, 3)).toBe("missing"));
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/services/pipeline/background.test.ts`. Expect FAIL with `draftsState is not a function`.
- [ ] **Step 3: implement.** Also update the `backgroundRunning` doc comment: the run is now `ready` after stage ②, so drafts, Prep and Learning all land behind it.
- [ ] **Step 4:** the test passes. The full suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(pipeline): derive drafts state from status, claim and cap`.

### Task 4: `parsingFinished`

**Files.**
- Modify `lib/services/pipeline/stages.ts`.
- Create `tests/services/pipeline/stages.test.ts`.

**Interfaces.** `export function parsingFinished(update: StageUpdate): boolean`. It returns true for `matching` with `done`, or for `preparing` when `progressPct >= 100` and `state !== "running"`. Everything else is false, including `rewriting` `done` or `degraded`.

- [ ] **Step 1: failing tests**:
```ts
import { expect, it } from "vitest";
import { parsingFinished, type StageUpdate } from "@/lib/services/pipeline/stages";
it.each<[StageUpdate, boolean]>([
  [{ stage: "matching", state: "done", progressPct: 45 }, true],
  [{ stage: "matching", state: "running", progressPct: 25 }, false],
  [{ stage: "reading", state: "done", progressPct: 25 }, false],
  [{ stage: "rewriting", state: "done", progressPct: 80 }, false],
  [{ stage: "rewriting", state: "degraded", progressPct: 80, message: "x" }, false],
  [{ stage: "preparing", state: "done", progressPct: 100 }, true],
  [{ stage: "preparing", state: "degraded", progressPct: 100 }, true],
  [{ stage: "preparing", state: "running", progressPct: 100 }, false],
  [{ stage: "preparing", state: "running", progressPct: 80 }, false],
  [{ stage: "reading", state: "failed", progressPct: 0 }, false],
])("parsingFinished(%j) → %s", (u, want) => expect(parsingFinished(u)).toBe(want));
```
- [ ] **Step 2:** run `pnpm vitest run tests/services/pipeline/stages.test.ts`. Expect FAIL with `parsingFinished is not a function`.
- [ ] **Step 3: implement** it as a one-expression function with a doc comment: "the run is `ready` before it announces matching done".
- [ ] **Step 4:** the test passes. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(pipeline): parsingFinished — finish on matching done`.

### Task 5: `stillNotEvidenced`

**Files.**
- Modify `lib/domain/coverage.ts`.
- Modify `tests/domain/coverage.test.ts` (append; reuse its `requirement` helper).

**Interfaces.**
```ts
export interface NotEvidencedItem { label: string; necessity: Necessity }
export function stillNotEvidenced(absent: readonly DomainRequirement[]): NotEvidencedItem[]
```
- `label` is `skillName ?? text`.
- Items sort by `WEIGHT[necessity]` descending, stably, so input order holds within a necessity.
- Duplicates are dropped case-insensitively by label, keeping the first after sorting.
- There is no cap on length.

- [ ] **Step 1: failing test** (append):
```ts
import { stillNotEvidenced } from "@/lib/domain/coverage";
it("stillNotEvidenced: required → preferred → implied, skill name over text, deduped", () => {
  expect(stillNotEvidenced([
    requirement("r1", "implied", "Writes docs"),
    requirement("r2", "preferred", "Terraform", "Terraform"),
    requirement("r3", "required", "Kubernetes at scale", "Kubernetes"),
    requirement("r4", "required", "Owns on-call rotation"),
    requirement("r5", "preferred", "k8s", "kubernetes"),
  ])).toEqual([
    { label: "Kubernetes", necessity: "required" },
    { label: "Owns on-call rotation", necessity: "required" },
    { label: "Terraform", necessity: "preferred" },
    { label: "Writes docs", necessity: "implied" },
  ]);
  expect(stillNotEvidenced([])).toEqual([]);
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/domain/coverage.test.ts`. Expect FAIL with `stillNotEvidenced is not a function`.
- [ ] **Step 3: implement** using `[...absent].sort((a,b) => WEIGHT[b.necessity] - WEIGHT[a.necessity])` followed by a Set-based dedupe.
- [ ] **Step 4:** the test passes. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(domain): stillNotEvidenced list for the Résumés panel`.

### Task 6: `ready` written with the score; late ready update deleted

**Files.**
- Modify `lib/services/pipeline/run-analysis.ts`.
- Create `tests/services/pipeline/run-analysis.test.ts`. Tasks 7–9 extend this file.

**Interfaces.** No signature changes. The data at about `:395` becomes `{ score, scoreVerdict, scoreNote, status: "ready" }`. The `db.analysis.update({ ... status: "ready" })` at about `:644` is deleted. `emit(rewritingUpdate)` stays where it is. Order: update the score with `ready`, then emit `matching done`.

**Test harness.** Put this at the top of the new test file; the coder copies it exactly.
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  db: {
    analysis: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() }, skill: { findMany: vi.fn() },
    jdRequirement: { createManyAndReturn: vi.fn() }, coverageItem: { createMany: vi.fn() },
    interviewQuestion: { createMany: vi.fn() },
    resumeDraft: { deleteMany: vi.fn(), createMany: vi.fn() }, tailoredBullet: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  analyzeJd: vi.fn(), tailorBullet: vi.fn(), tailorSummary: vi.fn(), generateQuestions: vi.fn(),
  buildLearningPlan: vi.fn(), renderFitted: vi.fn(), buildRenderModel: vi.fn(),
  getBullets: vi.fn(), toDomainBullets: vi.fn(), getCoverage: vi.fn(), getProfileById: vi.fn(), getRequirements: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/ai/services/analyze-jd", () => ({ analyzeJd: h.analyzeJd }));
vi.mock("@/lib/ai/services/tailor", () => ({ tailorBullet: h.tailorBullet, tailorSummary: h.tailorSummary }));
vi.mock("@/lib/ai/services/interview", () => ({ generateQuestions: h.generateQuestions }));
vi.mock("@/lib/services/learning/build-plan", () => ({ buildLearningPlan: h.buildLearningPlan }));
vi.mock("@/lib/render/pdf", () => ({ renderFitted: h.renderFitted }));
vi.mock("@/lib/render/model", () => ({ buildRenderModel: h.buildRenderModel }));
vi.mock("@/lib/db/queries/profile", () => ({ getBullets: h.getBullets, toDomainBullets: h.toDomainBullets }));
vi.mock("@/lib/db/queries/analysis", () => ({ getCoverage: h.getCoverage, getProfileById: h.getProfileById, getRequirements: h.getRequirements }));
import { runAnalysis } from "@/lib/services/pipeline/run-analysis";

const REQS = [
  { id: "r1", kind: "hard_skill", text: "TypeScript", necessity: "required", mentionCount: 2, skillName: "TypeScript", evidenceQuote: "TypeScript" },
  { id: "r2", kind: "hard_skill", text: "Kubernetes", necessity: "preferred", mentionCount: 1, skillName: "Kubernetes", evidenceQuote: "Kubernetes" },
];
const bulletsOf = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `b${i}`, text: `Shipped feature ${i} in TypeScript`, scope: "work", scopeRef: "work.0", skillNames: ["TypeScript"], recencyMonths: 12 }));
const rewritten = (b: { id: string; text: string }, over: object = {}) => ({ ok: true, value: {
  sourceBulletId: b.id, originalText: b.text, rewrittenText: `${b.text}, end to end`, transform: "rephrase",
  targetsRequirementId: "r1", aiRunId: null, blockedBy: [], tokensUsed: 100, ...over } });
let log: ReturnType<typeof vi.spyOn>;

function setup({ fresh = false, cap = 3, n = 4 } = {}) {
  const bs = bulletsOf(n);
  const cov = [{ requirementId: "r1", status: "evidenced", evidenceBulletIds: bs.map((b) => b.id), rationale: "" },
               { requirementId: "r2", status: "absent", evidenceBulletIds: [], rationale: "" }];
  h.db.analysis.updateMany.mockResolvedValue({ count: 1 });
  h.db.analysis.findFirst.mockImplementation(async (a: { select?: { _count?: unknown } }) => a?.select?._count
    ? { _count: { jdRequirements: fresh ? 0 : 2, coverageItems: fresh ? 0 : 2, resumeDrafts: 0, interviewQuestions: 1 }, learningPlan: { id: "lp1" } }
    : { id: "a1", clerkUserId: "u1", profileId: "p1", rawText: "posting", title: "Engineer", company: "Acme", stageState: {}, status: "parsing" });
  h.db.analysis.update.mockResolvedValue({});
  h.db.user.findUnique.mockResolvedValue({ capResumes: cap, role: "member" });
  h.db.skill.findMany.mockResolvedValue([]);
  h.db.jdRequirement.createManyAndReturn.mockImplementation(async ({ data }: { data: object[] }) => data.map((d, i) => ({ ...d, id: `r${i + 1}` })));
  h.db.coverageItem.createMany.mockResolvedValue({ count: 2 });
  h.db.resumeDraft.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  h.db.tailoredBullet.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  h.db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  h.analyzeJd.mockResolvedValue({ ok: true, value: { truncated: false, analysis: { usedRegions: [],
    meta: { language: "en", isJobPosting: true, company: "Acme", title: "Engineer", location: "", seniority: "senior", employmentType: "full_time" },
    requirements: REQS.map(({ id: _id, ...r }) => r) } } });
  h.getProfileById.mockResolvedValue({ id: "p1", resumeJson: { basics: { name: "A", summary: "" }, skills: [{ name: "TypeScript", keywords: [] }], work: [] } });
  h.getBullets.mockResolvedValue([]); h.toDomainBullets.mockReturnValue(bs);
  h.getRequirements.mockResolvedValue(REQS); h.getCoverage.mockResolvedValue(cov);
  h.tailorBullet.mockImplementation(async ({ bullet }: { bullet: { id: string; text: string } }) => rewritten(bullet));
  h.tailorSummary.mockResolvedValue({ ok: true, value: { summary: "Led with TypeScript.", professionalSummary: "", aiRunId: "" } });
  h.generateQuestions.mockResolvedValue({ ok: true, value: { questions: [] } });
  h.buildLearningPlan.mockResolvedValue({ narrativeDegraded: false });
  h.buildRenderModel.mockReturnValue({});
  h.renderFitted.mockResolvedValue({ pageCount: 1 });
  return bs;
}
const run = (emit = vi.fn()) => runAnalysis({ clerkUserId: "u1", analysisId: "a1", emit }).then(() => emit);
const logged = () => log.mock.calls.map((c) => String(c[0])).join("\n");
beforeEach(() => { vi.clearAllMocks(); log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
```
If TypeScript complains about the fixtures, cast with `as never`. Typecheck covers `tests/`.

- [ ] **Step 1: failing test**:
```ts
describe.each([["resumed", false], ["fresh", true]])("ready on the %s path", (_n, fresh) => {
  it("is written in the score update, before matching is announced done, and nowhere else", async () => {
    setup({ fresh });
    const emit = await run();
    const datas = h.db.analysis.update.mock.calls.map((c) => c[0].data);
    const scoreIdx = datas.findIndex((d) => d.score !== undefined);
    expect(datas[scoreIdx]).toMatchObject({ status: "ready" });
    expect(datas.filter((d) => d.status === "ready")).toHaveLength(1);
    const doneIdx = emit.mock.calls.findIndex(([u]) => u.stage === "matching" && u.state === "done");
    expect(h.db.analysis.update.mock.invocationCallOrder[scoreIdx]).toBeLessThan(emit.mock.invocationCallOrder[doneIdx]);
  });
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/services/pipeline/run-analysis.test.ts`. Expect FAIL with `expected { score: '…', scoreVerdict: '…', scoreNote: '…' } to match object { status: 'ready' }` on both paths. The harness has no `resumeDraft.create`, so today's writeDrafts throws inside its own catch, which is harmless.
- [ ] **Step 3: implement.**
  - Add `status: "ready"` to the score update.
  - Delete the late ready update.
  - Rewrite the comment above the score update: ready now means "score and buckets exist", and ③–⑤ land behind it.
  - Rewrite the comment above `rewritingUpdate`: nothing listens for this emit any more.
  - Fix the header at `:31`: "6 × resume_drafts" becomes "capResumes × resume_drafts".
- [ ] **Step 4:** the test passes. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(pipeline): mark analysis ready with the score, before tailoring`.

### Task 7: skip stage ③ when the cap is 0

**Files.**
- Modify `lib/services/pipeline/run-analysis.ts`.
- Modify `tests/services/pipeline/run-analysis.test.ts`.

**Interfaces.** `if (!done.rewriting)` becomes `if (!done.rewriting && expectedDrafts > 0)`.

- [ ] **Step 1: failing test**:
```ts
it("a member whose draft cap is 0 is never billed for tailoring", async () => {
  setup({ cap: 0 });
  await run();
  expect(h.tailorBullet).not.toHaveBeenCalled();
  expect(h.tailorSummary).not.toHaveBeenCalled();
  expect(h.renderFitted).not.toHaveBeenCalled();
  expect(h.db.$transaction).not.toHaveBeenCalled();
  expect(h.db.analysis.update.mock.calls.some((c) => c[0].data.status === "ready")).toBe(true);
});
```
- [ ] **Step 2:** run the file. Expect FAIL with `expected "spy" to not be called at all, but actually been called 4 times`.
- [ ] **Step 3: implement** the one condition, with a one-line comment citing F15 cap 0.
- [ ] **Step 4:** green. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `fix(pipeline): skip tailoring entirely when capResumes is 0`.

### Task 8: `writeDrafts` as one batch

**Files.**
- Modify `lib/services/pipeline/run-analysis.ts`.
- Modify `tests/services/pipeline/run-analysis.test.ts`.

**Interfaces.** Consumes `mapLimit` from `@/lib/shared/utils`. The internal signature of `writeDrafts` is unchanged. The body:
1. `const plan = templatesFor(cap)`.
2. `const pages = await mapLimit(plan, 4, (t) => measurePages(model, t.id, tailored.length))`.
3. Log `` `[pipeline] pages templates=${plan.length} ms=${ms}` ``.
4. Build `draftRows` with `id: crypto.randomUUID()` and the same fields as today, with `pageCount: pages[k]`.
5. Build `bulletRows` as `draftRows.flatMap(d => tailored.map((t, i) => ({ …, draftId: d.id, ordinal: i })))`.
6. `await db.$transaction([db.resumeDraft.createMany({ data: draftRows }), ...(bulletRows.length ? [db.tailoredBullet.createMany({ data: bulletRows })] : [])])`.

`resumeDraft.create` is no longer called. Update the `resumeState` docblock table row for rewriting to "one batch `$transaction`" with the "full count" rule kept, and update the "loop" prose.

- [ ] **Step 1: failing tests**:
```ts
describe("writeDrafts", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it("writes every draft and its bullets in one batch transaction with app-made ids", async () => {
    setup({ cap: 3, n: 4 });
    h.renderFitted.mockImplementation(async (_m: unknown, id: string) => ({ pageCount: (id.length % 3) + 1 }));
    await run();
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    const drafts = h.db.resumeDraft.createMany.mock.calls[0][0].data;
    expect(drafts).toHaveLength(3);
    for (const d of drafts) { expect(d.id).toMatch(UUID); expect(d.pageCount).toBe((d.templateId.length % 3) + 1); }
    expect(new Set(drafts.map((d: { id: string }) => d.id)).size).toBe(3);
    const rows = h.db.tailoredBullet.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(12);
    for (const d of drafts) expect(rows.filter((r: { draftId: string }) => r.draftId === d.id).map((r: { ordinal: number }) => r.ordinal)).toEqual([0, 1, 2, 3]);
    expect(rows.every((r: { sourceBulletId: string }) => /^b\d+$/.test(r.sourceBulletId))).toBe(true); // N1
    expect(logged()).toMatch(/\[pipeline\] pages templates=3 ms=\d+/);
  });
  it("measures at most four templates at once", async () => {
    setup({ cap: 11 });
    let inFlight = 0, peak = 0;
    h.renderFitted.mockImplementation(async () => { inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2)); inFlight--; return { pageCount: 1 }; });
    await run();
    expect(h.renderFitted).toHaveBeenCalledTimes(11);
    expect(peak).toBe(4);
  });
});
```
- [ ] **Step 2:** run the file. Expect FAIL with `expected "spy" to be called 1 times, but got 0 times` (`$transaction`).
- [ ] **Step 3: implement** as described above. Cast `resumeJson` exactly as today (`as object`).
- [ ] **Step 4:** green. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `perf(pipeline): batch draft writes in one transaction, measure pages 4 at a time`.

### Task 9: tailoring via `mapLimit`, the deadline and the count log

**Files.**
- Modify `lib/services/pipeline/run-analysis.ts`.
- Modify `tests/services/pipeline/run-analysis.test.ts`.

**Interfaces.**
- Change `TAILOR_CONCURRENCY` to `export const TAILOR_CONCURRENCY = 10;`.
- Add `export const TAILOR_START_DEADLINE_MS = 180_000;` with a comment: measured from `executeAnalysis` start, so the summary, the pages and the write still fit `maxDuration = 300`.
- Capture `const startedAt = Date.now()` as the first line of `executeAnalysis`.
- Replace the hand-written worker loop with `const results = await mapLimit(ranked, TAILOR_CONCURRENCY, async (entry) => …)`. Each call makes these checks synchronously, before any await:
  - If `Date.now() - startedAt > TAILOR_START_DEADLINE_MS`, return a verbatim result with `blockedBy: ["deadline"]`, `targetsRequirementId: null` and `tokensUsed: 0`.
  - Else, if `budget.exceeded()`, return the same shape with `["token_ceiling"]`.
  - Else call `tailorBullet`. When `result.ok`, call `budget.add(result.value.tokensUsed)` and return `result.value`.
  - When not ok, return `null`, as today's empty slot does.
  - After each item, emit progress with `progressWithin` as today.
- Collect with `tailored.push(...results.filter(Boolean))`.
- Then log `` `[pipeline] tailor bullets=${t.bullets} rewritten=${t.rewritten} verbatim=${t.verbatim} transient=${t.transient} checker=${t.checker} guard=${t.guard} ceiling=${t.ceiling} deadline=${t.deadline} ms=${ms}` `` from `tailorTally(tailored)`.
- Delete the local `buildChangeList` and import it from `@/lib/domain/diff`.
- Delete the `ceilingHit` variable and its `rewritingUpdate` branch; the notice now arrives through `changes`.
- Delete the `aborted` flag; `mapLimit`'s rejection now carries the throw into the existing catch, which degrades the stage.
- Rewrite the comment above the loop accordingly.

- [ ] **Step 1: failing tests** (add imports `TAILOR_CONCURRENCY, TAILOR_START_DEADLINE_MS` from run-analysis, `STOPPED_PARTWAY` from `@/lib/domain/diff`, and `ANALYSIS_TOKEN_CEILING` from `@/lib/domain/tokens`):
```ts
describe("tailoring", () => {
  const changesOf = () => h.db.resumeDraft.createMany.mock.calls[0][0].data[0].changes as string[];
  const firstDraftRows = () => { const d = h.db.resumeDraft.createMany.mock.calls[0][0].data[0];
    return h.db.tailoredBullet.createMany.mock.calls[0][0].data.filter((r: { draftId: string }) => r.draftId === d.id); };

  it("runs TAILOR_CONCURRENCY (10) calls at once", async () => {
    expect(TAILOR_CONCURRENCY).toBe(10);
    setup({ n: 15 });
    let inFlight = 0, peak = 0;
    h.tailorBullet.mockImplementation(async ({ bullet }) => { inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2)); inFlight--; return rewritten(bullet); });
    await run();
    expect(peak).toBe(10);
  });

  it("past the start deadline the remaining bullets go verbatim, honestly labelled", async () => {
    expect(TAILOR_START_DEADLINE_MS).toBe(180_000);
    const T0 = new Date("2026-10-26T12:00:00Z").getTime();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0);
    setup({ n: TAILOR_CONCURRENCY + 2 });
    h.tailorBullet.mockImplementation(async ({ bullet }) => { await new Promise((r) => setTimeout(r, 0));
      vi.setSystemTime(T0 + TAILOR_START_DEADLINE_MS + 1); return rewritten(bullet); });
    await run();
    expect(h.tailorBullet).toHaveBeenCalledTimes(TAILOR_CONCURRENCY);
    const verbatim = firstDraftRows().filter((r: { transform: string }) => r.transform === "verbatim");
    expect(verbatim).toHaveLength(2);
    for (const r of verbatim) expect(r.rewrittenText).toBe(r.originalText);
    expect(changesOf()).toContain(STOPPED_PARTWAY);
    expect(changesOf().some((c) => /rejected for adding detail/.test(c))).toBe(false);
    expect(logged()).toMatch(/deadline=2 /);
  });

  it("past the token ceiling the notice lands in draft.changes, not as a rejection", async () => {
    setup({ n: TAILOR_CONCURRENCY + 2 });
    h.tailorBullet.mockImplementation(async ({ bullet }) => { await new Promise((r) => setTimeout(r, 0));
      return rewritten(bullet, { tokensUsed: ANALYSIS_TOKEN_CEILING }); });
    await run();
    expect(changesOf()).toContain(STOPPED_PARTWAY);
    expect(changesOf().some((c) => /rejected for adding detail/.test(c))).toBe(false);
    expect(logged()).toMatch(/ceiling=2 /);
  });

  it("logs one count line per run and no bullet text (N7)", async () => {
    setup({ n: 6 });
    const blocked: Record<string, string[]> = { b0: ["checker"], b1: ["tool:Kubernetes"], b2: ["model_failed"] };
    h.tailorBullet.mockImplementation(async ({ bullet }) => blocked[bullet.id]
      ? rewritten(bullet, { rewrittenText: bullet.text, transform: "verbatim", blockedBy: blocked[bullet.id] })
      : rewritten(bullet));
    await run();
    const lines = logged().split("\n").filter((l) => l.startsWith("[pipeline] tailor "));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[pipeline\] tailor bullets=6 rewritten=3 verbatim=3 transient=1 checker=1 guard=1 ceiling=0 deadline=0 ms=\d+$/);
    expect(lines[0]).not.toContain("Shipped");
  });
});
```
- [ ] **Step 2:** run the file. Expect FAIL with `expected undefined to be 10` (the constant is not exported yet).
- [ ] **Step 3: implement** as described above.
- [ ] **Step 4:** the whole file passes, including Tasks 6–8. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `perf(pipeline): tailor 10 at a time with a 180s start deadline and a count log`.

### Task 10: parsing screen and route comment

**Files.**
- Modify `app/(app)/analysis/[id]/parsing-screen.tsx`.
- Modify `app/api/analyze/[id]/route.ts` (comment only, about `:35–41`).
- Create `tests/app/progressive-wiring.test.ts`.

**Interfaces.** Consumes `parsingFinished` from Task 4.

- [ ] **Step 1: failing test**:
```ts
import { describe, expect, it } from "vitest";
import { sourceOf } from "../structure/files";
describe("parsing screen", () => {
  const src = sourceOf("app/(app)/analysis/[id]/parsing-screen.tsx");
  it("finishes on parsingFinished, not on stage ③", () => {
    expect(src).toContain("parsingFinished(update)");
    expect(src).not.toMatch(/update\.stage === "rewriting"/);
  });
  it("shows two pips and says the results are ready", () => {
    expect(src).toMatch(/s\.key === "reading" \|\| s\.key === "matching"/);
    expect(src).toContain('done="Your results are ready"');
    expect(src).not.toContain("Your drafts are ready");
  });
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/app/progressive-wiring.test.ts`. Expect FAIL with `expected '…' to contain 'parsingFinished(update)'`.
- [ ] **Step 3: implement.**
  - In `apply`, replace the `if ((rewriting …) || (preparing …))` block with `if (parsingFinished(update)) finished = true;`.
  - Replace the comment above it with: the run is `ready` before it announces matching done.
  - Change to `const shown = STAGES.filter((s) => s.key === "reading" || s.key === "matching");`.
  - Change to `done="Your results are ready"`.
  - Update the file's header docblock: the screen leaves when the score exists.
  - In `route.ts`, change only the comment: the analysis is `ready` from stage ② onward, and `?resume=1` is also how "Finish the drafts" asks for a missing stage ③.
- [ ] **Step 4:** green. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(parsing): leave for results when the score lands`.

### Task 11: Résumés tab count while generating

**Files.**
- Modify `app/(app)/analysis/[id]/analysis-tabs.tsx:55`.
- Create `tests/app/analysis-tabs.test.tsx`.

- [ ] **Step 1: failing test**:
```tsx
import { expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ usePathname: () => "/analysis/a1/resumes" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children),
  useLinkStatus: () => ({ pending: false }),
}));
import { AnalysisTabs, type TabCounts } from "@/app/(app)/analysis/[id]/analysis-tabs";
(globalThis as { React?: typeof React }).React = React;
const counts: TabCounts = { resumes: 0, questions: 0, gaps: 0, roadmapProgress: null, drills: 0, nextRound: null, study: "Set a date" };
const resumesCount = (c: TabCounts, generating: boolean) =>
  renderToStaticMarkup(createElement(AnalysisTabs, { analysisId: "a1", counts: c, generating }))
    .match(/href="\/analysis\/a1\/resumes"[\s\S]*?<span class="tab-count">([^<]*)<\/span>/)?.[1];
it("reads Preparing… while drafts are generating", () => expect(resumesCount(counts, true)).toBe("Preparing…"));
it("reads the count once drafts exist", () => expect(resumesCount({ ...counts, resumes: 4 }, true)).toBe("4"));
it("reads 0 once nothing is generating", () => expect(resumesCount(counts, false)).toBe("0"));
```
- [ ] **Step 2:** run `pnpm vitest run tests/app/analysis-tabs.test.tsx`. Expect FAIL with `expected '0' to be 'Preparing…'`.
- [ ] **Step 3: implement.** Change the count to `generating && counts.resumes === 0 ? PENDING : String(counts.resumes)`. Update the `generating` prop doc to "Drafts, Prep and Learning still generating".
- [ ] **Step 4:** green. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `feat(results): Résumés tab reads Preparing… while drafts land`.

### Task 12: drafts placeholder, "Still not evidenced" panel, and page wiring

**Files.**
- Modify `components/background-pending.tsx` (add `DraftsPlaceholder`).
- Create `app/(app)/analysis/[id]/resumes/not-evidenced.tsx`.
- Modify `app/(app)/analysis/[id]/resumes/page.tsx`.
- Modify `app/(app)/analysis/[id]/preview/[templateId]/page.tsx`.
- Create `tests/components/background-pending.test.tsx`.
- Create `tests/app/not-evidenced.test.tsx`.
- Modify `tests/app/progressive-wiring.test.ts`.

**Interfaces.**

`DraftsPlaceholder`:
```ts
export function DraftsPlaceholder({ state, analysisId }: { state: Exclude<DraftsState, "ready">; analysisId: string }): JSX.Element
```

| `state` | Renders |
|---|---|
| `pending` | `<SectionPending title="Writing your drafts">Your match is ready now. The drafts are still being written from your own bullets — this tab fills in on its own.</SectionPending>` |
| `missing` | `<EmptyState title="The drafts didn't finish">Your match and the other tabs are unaffected. Finishing them runs only this stage — nothing that already finished is charged twice.</EmptyState>` plus `<ResumeStageButton analysisId={analysisId} label="Finish the drafts" />` |
| `off` | `<EmptyState title="Drafts are off for your account">Your match, Prep and Learning are unaffected.</EmptyState>`, with no button |

`NotEvidencedPanel` is a server component with no hooks:
```ts
export function NotEvidencedPanel({ analysisId, items }: { analysisId: string; items: NotEvidencedItem[] }): JSX.Element | null
```
It returns `null` when `items` is empty. Otherwise:
- `<Card flat className="mt-8">` containing `<h3 className="mb-2">Still not evidenced</h3>`.
- A muted paragraph: "The posting asks for these; your profile doesn't show them, so no draft claims them."
- A wrap row of `<Tag tone="sage" className={label.length > 28 ? "tag-long" : undefined}>`, keyed by label.
- A `next/link` to `` `/analysis/${analysisId}/learning?skills=${encodeURIComponent(items.map(i => i.label).join(","))}` `` with `<GraduationCap className="lucide h-4 w-4" />` and the text "See courses for these". Use the preview's link classes (`inline-flex items-center gap-1.5 text-sm font-extrabold underline underline-offset-[3px]`).
- Tokens and DS classes only. No hex, and no `rounded-[…]`.

- [ ] **Step 1: failing tests.**

`tests/components/background-pending.test.tsx`: mock `next/navigation` as `{ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }` and set the React global as in Task 11.
```tsx
const html = (state: "pending" | "missing" | "off") => renderToStaticMarkup(createElement(DraftsPlaceholder, { state, analysisId: "a1" }));
it("pending: a status loader, no button", () => { const h = html("pending"); expect(h).toContain("Writing your drafts"); expect(h).toContain('role="status"'); expect(h).not.toContain("<button"); });
it("missing: offers to finish the drafts", () => { expect(html("missing")).toContain("The drafts didn"); expect(html("missing")).toContain("Finish the drafts"); });
it("off: says so and offers nothing", () => { const h = html("off"); expect(h).toContain("Drafts are off for your account"); expect(h).not.toContain("<button"); });
it("never names a draft count (§5)", () => { for (const s of ["pending", "missing", "off"] as const) expect(html(s)).not.toMatch(/\b\d+\s+drafts?\b/i); });
```

`tests/app/not-evidenced.test.tsx`: mock `next/link` as in Task 11 and set the React global.
```tsx
const items = [{ label: "Kubernetes", necessity: "required" as const }, { label: "Terraform", necessity: "preferred" as const }];
const html = renderToStaticMarkup(createElement(NotEvidencedPanel, { analysisId: "a1", items }));
it("titles the panel and keeps the order it was given", () => { expect(html).toContain("Still not evidenced"); expect(html.indexOf("Kubernetes")).toBeLessThan(html.indexOf("Terraform")); });
it("links to Learning filtered to these skills", () => expect(html).toContain('href="/analysis/a1/learning?skills=Kubernetes%2CTerraform"'));
it("uses DS tokens only — no hex, no ad-hoc radius (N9)", () => { expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i); expect(html).not.toMatch(/rounded-\[/); });
it("renders nothing when everything is evidenced", () =>
  expect(renderToStaticMarkup(createElement(NotEvidencedPanel, { analysisId: "a1", items: [] }))).toBe(""));
```

Append to `tests/app/progressive-wiring.test.ts`:
```ts
describe("Résumés tab and preview", () => {
  const resumes = sourceOf("app/(app)/analysis/[id]/resumes/page.tsx");
  const preview = sourceOf("app/(app)/analysis/[id]/preview/[templateId]/page.tsx");
  it("the Résumés tab derives its state and shows the panel", () => {
    for (const s of ["draftsState(", "draftsPerRun(", "<DraftsPlaceholder", "<NotEvidencedPanel", "stillNotEvidenced(scoreAnalysis("]) expect(resumes).toContain(s);
    expect(resumes).not.toContain("The drafts didn't generate");
  });
  it("the preview waits instead of saying the draft doesn't exist", () => {
    expect(preview).toContain("draftsState(");
    expect(preview).toContain("<DraftsPlaceholder");
  });
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/components/background-pending.test.tsx tests/app/not-evidenced.test.tsx tests/app/progressive-wiring.test.ts`. Expect FAIL with `DraftsPlaceholder is not a function` or `Cannot find module …/not-evidenced`, and `expected … to contain 'draftsState('`.
- [ ] **Step 3: implement.**

  **Résumés page.**
  1. Add `draftsPerRun(userId)` (from `@/lib/db/queries/entitlement`) to the first `Promise.all`.
  2. Move the `profile, requirements, coverage` read above the drafts branch.
  3. Compute `const notEvidenced = stillNotEvidenced(scoreAnalysis(requirements, coverage).buckets.absent)`.
  4. Compute `const state = draftsState(analysis, drafts.length, cap)`.
  5. If `state !== "ready"`, return `<section><DraftsPlaceholder state={state} analysisId={id} /><NotEvidencedPanel analysisId={id} items={notEvidenced} /></section>`.
  6. Otherwise keep the existing layout and render `<NotEvidencedPanel …/>` after the draft grid.
  7. Leave `resume_drafts.missing` and the preview's own panel untouched.

  **Preview page.** In the `!draft || !template` branch:
  1. Compute `const state = draftsState(analysis, drafts.length, await draftsPerRun(userId))`.
  2. If `state !== "ready"`, return `<DraftsPlaceholder state={state} analysisId={id} />`.
  3. Otherwise keep the existing "That draft doesn't exist" EmptyState.
  4. Update the comment at `:36`.
- [ ] **Step 4:** green. Suite and typecheck are green (`tests/structure/token-copy.test.ts` included). Then look at it: `pnpm dev`, run one analysis, and confirm the score appears, the Résumés tab shows the loader, then the drafts, and the panel link opens Learning filtered.
- [ ] **Step 5:** hand to jiraiya with `feat(results): drafts loader, finish/off states and Still-not-evidenced panel`.

### Task 13: injection check runs alongside the model call

**Files.**
- Modify `lib/ai/agents/define.ts:70-77`.
- Create `tests/ai/agents/define.test.ts`.

**Interfaces.** In `runAgent`:
1. Start the check: `const injection = agent.inputGuards.includes("injection_jev") && agent.documentKind ? checkInjection(injectionCheckText(guarded.text), agent.documentKind, ctx).catch(() => null) : null;`.
2. Start `runStructured(...)` without awaiting it first; keep the promise.
3. Then `const verdict = await injection; if (verdict?.flagged) guarded.flags.push("injection:jev");`.
4. Emit the `console.warn` flags line.
5. Return the awaited run result.

Behaviour is unchanged apart from timing. Behaviour change: a rejecting check now fails open instead of rejecting `runAgent`.

- [ ] **Step 1: failing tests**:
```ts
import { expect, it, vi } from "vitest";
import { z } from "zod";
const h = vi.hoisted(() => ({ runStructured: vi.fn(), checkInjection: vi.fn() }));
vi.mock("@/lib/ai/openai/run", () => ({ runStructured: h.runStructured }));
vi.mock("@/lib/ai/typesafe/injection", () => ({ checkInjection: h.checkInjection }));
import { defineAgent, runAgent } from "@/lib/ai/agents/define";
const agent = defineAgent({ name: "t", promptVersion: "1", model: "writer-fast", schema: z.object({}), system: "s",
  dynamicContext: (i: string) => i, reasoningEffort: "low", maxOutputTokens: 10, retries: 0,
  inputGuards: ["injection_jev"], documentKind: "posting", outputGuards: [] });
const OK = { ok: true, value: { value: {}, aiRunId: "x", retryCount: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } };
it("starts the model call without waiting for the injection check, and still records a flag", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  let release!: (v: unknown) => void;
  h.checkInjection.mockReturnValue(new Promise((r) => { release = r; }));
  h.runStructured.mockResolvedValue(OK);
  const pending = runAgent(agent, "text", { clerkUserId: "u" });
  await vi.waitFor(() => expect(h.runStructured).toHaveBeenCalledTimes(1));
  release({ flagged: true, p: 0.9, kind: "none", skipped: false });
  expect(await pending).toEqual(OK);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("injection:jev"));
});
it("a failing injection check fails open", async () => {
  h.checkInjection.mockRejectedValue(new Error("down"));
  h.runStructured.mockResolvedValue(OK);
  expect(await runAgent(agent, "text", { clerkUserId: "u" })).toEqual(OK);
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/ai/agents/define.test.ts`. Expect FAIL: the `waitFor` times out with `expected "spy" to be called 1 times, but got 0 times`, and the second test rejects with `down`.
- [ ] **Step 3: implement** as described above.
- [ ] **Step 4:** green. Suite and typecheck are green, and `tests/ai/agents.test.ts` is unchanged.
- [ ] **Step 5:** hand to jiraiya with `perf(ai): run the Jev injection check alongside the writer call`.

### Task 14: `--role` flag for the eval

**Files.**
- Modify `scripts/evals/run.ts`.
- Modify `scripts/evals/live.ts`.
- Create `tests/scripts/eval-run.test.ts`.

**Interfaces.**
- In `run.ts`: `export function parseRole(argv: readonly string[]): "writer" | "writer-fast" | undefined`. It returns `undefined` when `--role` is absent and throws `Error("--role must be writer or writer-fast")` when the value is missing or invalid.
- `runLive(agent, set, cases, arm, role?: "writer" | "writer-fast")`.
- In `live.ts`, add `const EVAL_AGENTS: Record<AgentKey, { model: "writer" | "writer-fast" }> = { "bullet-tailor": bulletTailor, "summary-tailor": summaryTailor, "answer-writer": answerWriter, "posting-reader": postingReader, "profile-reader": profileReader }`. If `role` is set, assign `EVAL_AGENTS[agent].model = role` before the loop. This is in-process, script only.
- Write `role: role ?? null` into the report JSON. Append `-${role}` to the report filename when set.
- Update the usage line and the header docblock: `[--role writer|writer-fast]`.

- [ ] **Step 1: failing test**:
```ts
import { expect, it } from "vitest";
import { parseRole } from "@/scripts/evals/run";
const argv = (...rest: string[]) => ["node", "run.ts", "bullet-tailor", ...rest];
it("parseRole", () => {
  expect(parseRole(argv())).toBeUndefined();
  expect(parseRole(argv("--role", "writer-fast"))).toBe("writer-fast");
  expect(parseRole(argv("--role", "writer"))).toBe("writer");
  expect(() => parseRole(argv("--role", "gpt-5"))).toThrow("--role must be writer or writer-fast");
  expect(() => parseRole(argv("--role"))).toThrow("--role must be writer or writer-fast");
});
```
- [ ] **Step 2:** run `pnpm vitest run tests/scripts/eval-run.test.ts`. Expect FAIL with `parseRole is not a function`.
- [ ] **Step 3: implement.** Call `parseRole` in `main()` before `--dry` returns, so a bad flag fails fast.
- [ ] **Step 4:** green. Suite and typecheck are green. Also run `pnpm eval bullet-tailor --dry --role writer-fast`; it should exit 0.
- [ ] **Step 5:** hand to jiraiya with `feat(evals): --role flag overrides the agent model in the eval only`.

### Task 15: docs

**Files.** Modify `docs/product/specs.md`. No test: the content is docs only. Read the paragraphs once with neji's review.

- **§8 Flow.** Change the parsing-screen line to "leaves for results when ② ends (③ ④ ⑤ finish behind)".
- **F3.** Rewrite the "screen leaves" paragraph:
  - `ready` is written with the score after ②. The screen finishes on `parsingFinished` (matching `done`, or `preparing` at 100 for a followed run).
  - The card shows two pips. Its done copy is "Your results are ready".
  - `backgroundRunning` now covers drafts too.
  - The Résumés count reads `Preparing…`.
- **F5.** Add the drafts states from `draftsState`: pending (loader), missing ("Finish the drafts" with `?resume=1`), off (cap 0, no button, stage ③ skipped).
  - Add the "Still not evidenced" panel: one per analysis, read-only, from `scoreAnalysis(...).buckets.absent` via `stillNotEvidenced`, ordered required → preferred → implied, linking to `/learning?skills=`. Nothing is inserted into a draft (N1, N3).
  - Tailoring runs 10 at once and stops starting new bullets at 180s from run start. Bullets after that go verbatim (`deadline`). The stop notice lives in `changes`. Only checker and guard blocks count as "rejected for adding detail".
  - Drafts are written in one batch transaction.
- **F14.** Behaviour change: a run killed during ③ is now `ready` and no longer appears as a stalled `parsing` run. Its Résumés tab shows "Finish the drafts" once the claim goes stale (≤6 min). `stalled.ts` therefore reports only runs that stopped in ① or ②.
- **§10.** Leave it unchanged until Task 16.

- [ ] Hand to jiraiya with `docs(specs): progressive results — §8, F3, F5, F14`.

### Task 16 (T-final): flip `tailor_bullet` to writer-fast, gated

**Gate.** kakashi runs this task ONLY if the main session confirms that `pnpm eval bullet-tailor --role writer-fast --arm gpt5+jev` passed the fabrication gate: 0 fabrications reaching output, and false fallbacks no worse than the `--role writer` run. Otherwise stop and leave the PENDING line open.

**Files.**
- Modify `lib/ai/agents/bullet-tailor.ts` (`model: "writer-fast"`).
- Modify `tests/ai/agents.test.ts`.
- Modify `docs/product/specs.md` §10 table row `tailor_bullet` (writer → writer-fast).

- [ ] **Step 1: failing test:** `it("tailor_bullet runs on writer-fast after the fabrication eval passed", () => assert.equal(bulletTailor.model, "writer-fast"));`
- [ ] **Step 2:** run `pnpm vitest run tests/ai/agents.test.ts`. Expect FAIL with `expected 'writer' to equal 'writer-fast'`.
- [ ] **Step 3:** flip the model. Update the agent's doc comment with the eval report filename.
- [ ] **Step 4:** green. Suite and typecheck are green.
- [ ] **Step 5:** hand to jiraiya with `perf(ai): tailor_bullet on writer-fast (fabrication eval passed <report>)`.

## Review focus for neji

1. **A run killed during ③.** The run is now `ready` with `runningAt` still set, so the Résumés tab shows "Writing your drafts" for up to `RUN_LOCK_STALE_MS` (6 min) before "Finish the drafts". Check that `?resume=1` gets through the route's ready short-circuit and the token check, and re-runs only ③. No test covers the route.
2. **Cap-0 members.** The Résumés tab count reads `Preparing…` while Prep and Learning run, because the layout does not know the cap. This is the accepted wording from the hokage ruling. Confirm it then settles to "0", and that the tab body shows "off".
3. **`?skills=` labels with commas.** A requirement-text label containing a comma splits wrongly on the Learning filter. That matches the preview's existing behaviour, and the filter falls back to the whole plan. Confirm the fallback still says so.
4. **The batch `$transaction`.** Check `resumeJson` typing for `createMany` (Json column), that app-made `id`s are accepted over `gen_random_uuid()`, and that the batch form is used and not the interactive callback (pgbouncer). The mocks cannot see Prisma's lazy `PrismaPromise` semantics.
5. **Deadline and summary timing.** After the 180s deadline, `tailorSummary` plus 11 page measurements plus the write must still finish under `maxDuration = 300`. A takeover via `followExistingRun` restarts `startedAt`. Check the `[pipeline] pages … ms=` numbers on a real long profile.
