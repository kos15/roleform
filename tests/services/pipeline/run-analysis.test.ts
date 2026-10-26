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
import { runAnalysis, RUN_LOCK_STALE_MS, TAILOR_CONCURRENCY, TAILOR_START_DEADLINE_MS } from "@/lib/services/pipeline/run-analysis";
import { STOPPED_PARTWAY } from "@/lib/domain/diff";
import { ANALYSIS_TOKEN_CEILING } from "@/lib/domain/tokens";

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

it("a member whose draft cap is 0 is never billed for tailoring", async () => {
  setup({ cap: 0 });
  await run();
  expect(h.tailorBullet).not.toHaveBeenCalled();
  expect(h.tailorSummary).not.toHaveBeenCalled();
  expect(h.renderFitted).not.toHaveBeenCalled();
  expect(h.db.$transaction).not.toHaveBeenCalled();
  expect(h.db.analysis.update.mock.calls.some((c) => c[0].data.status === "ready")).toBe(true);
});

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

describe("takeover and failure", () => {
  it("a takeover inherits the original function's start, so the tailor deadline still holds", async () => {
    const T0 = new Date("2026-10-26T12:00:00Z").getTime();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(T0);
    setup({ n: 4 });
    const base = h.db.analysis.findFirst.getMockImplementation()!;
    // The first claim loses; by the time the follower takes over, the original
    // function's deadline has long passed and its claim is stale.
    h.db.analysis.updateMany.mockReset();
    h.db.analysis.updateMany.mockImplementationOnce(async () => {
      vi.setSystemTime(T0 + RUN_LOCK_STALE_MS + TAILOR_START_DEADLINE_MS + 1);
      return { count: 0 };
    });
    h.db.analysis.updateMany.mockResolvedValue({ count: 1 });
    h.db.analysis.findFirst.mockImplementation(async (a: { select?: { status?: boolean } }) => a?.select?.status
      ? { status: "parsing", scoreNote: null, runningAt: new Date(T0) }
      : base(a));
    await run();
    expect(h.tailorBullet).not.toHaveBeenCalled();
    const rows = h.db.tailoredBullet.createMany.mock.calls[0][0].data as { transform: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.transform === "verbatim")).toBe(true);
    expect(logged()).toMatch(/deadline=4 /);
  });

  it("a throwing tailorBullet degrades rewriting, writes no drafts, and leaves ready and the other tabs alone", async () => {
    setup({ n: 4 });
    h.tailorBullet.mockRejectedValue(new Error("boom"));
    const emit = await run();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ stage: "rewriting", state: "degraded" }));
    expect(h.db.$transaction).not.toHaveBeenCalled();
    expect(h.db.analysis.update.mock.calls.filter((c) => c[0].data.status === "ready")).toHaveLength(1);
    expect(h.generateQuestions).not.toHaveBeenCalled(); // resumed path: questions already exist
    expect(h.buildLearningPlan).not.toHaveBeenCalled(); // resumed path: plan already exists
  });

  it("prep and learning still run when tailoring throws (fresh path)", async () => {
    setup({ fresh: true, n: 4 });
    h.db.analysis.findFirst.mockImplementation(async (a: { select?: { _count?: unknown } }) => a?.select?._count
      ? { _count: { jdRequirements: 0, coverageItems: 0, resumeDrafts: 0, interviewQuestions: 0 }, learningPlan: null }
      : { id: "a1", clerkUserId: "u1", profileId: "p1", rawText: "posting", title: "Engineer", company: "Acme", stageState: {}, status: "parsing" });
    h.tailorBullet.mockRejectedValue(new Error("boom"));
    await run();
    expect(h.generateQuestions).toHaveBeenCalledTimes(1);
    expect(h.buildLearningPlan).toHaveBeenCalledTimes(1);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("emits no rewriting progress after the degraded update", async () => {
    setup({ n: 4 });
    h.tailorBullet.mockImplementation(async ({ bullet }: { bullet: { id: string; text: string } }) => {
      if (bullet.id === "b0") throw new Error("boom");
      await new Promise((r) => setTimeout(r, 15));
      return rewritten(bullet);
    });
    const emit = await run();
    await new Promise((r) => setTimeout(r, 40)); // let the in-flight calls finish
    const stages = emit.mock.calls.map(([u]) => `${u.stage}:${u.state}`);
    const degradedAt = stages.indexOf("rewriting:degraded");
    expect(degradedAt).toBeGreaterThan(-1);
    expect(stages.slice(degradedAt + 1)).not.toContain("rewriting:running");
  });
});
