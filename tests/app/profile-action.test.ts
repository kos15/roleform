import { beforeEach, describe, expect, it, vi } from "vitest";
import { base } from "../domain/enhance.fixtures";

const m = vi.hoisted(() => ({
  requireFeature: vi.fn(),
  requireUser: vi.fn(),
  checkEnhanceAllowance: vi.fn(),
  readEnhanceAllowance: vi.fn(),
  checkTokenAllowance: vi.fn(),
  getProfile: vi.fn(),
  enhance: vi.fn(),
}));
vi.mock("@/lib/services/features", () => ({ requireFeature: m.requireFeature }));
vi.mock("@/lib/services/auth", () => ({
  requireUser: m.requireUser,
  checkEnhanceAllowance: m.checkEnhanceAllowance,
  readEnhanceAllowance: m.readEnhanceAllowance,
  checkTokenAllowance: m.checkTokenAllowance,
}));
vi.mock("@/lib/db/queries/profile", () => ({ getProfile: m.getProfile }));
vi.mock("@/lib/ai/services/enhance-profile", () => ({ enhanceProfile: m.enhance }));

import { enhanceProfile } from "@/app/actions/profile";
import { LIMITS } from "@/lib/services/rate-limit";

const resume = () => {
  const r = base();
  r.work = [{ ...r.work[0], highlights: ["Cut checkout load time by 40% using React.", "helped with  the design system"] }];
  r.projects = [];
  r.education = [];
  r.certificates = [];
  return r;
};
const proposals = [
  { kind: "rephrase", path: "work.0.highlights.0", text: "Cut checkout load time sharply with React.", reason: "Stronger verb." },
  { kind: "tidy", path: "work.0.highlights.1", text: "Helped with the design system.", reason: "Capitalisation and spacing." },
];
const allowance = { allowance: { allowed: true, used: 1, left: 1, nextAt: null, reason: "ok" }, blocked: null };

let n = 0;
let uid = "";
beforeEach(() => {
  uid = `user_${++n}`;
  Object.values(m).forEach((f) => f.mockReset());
  m.requireFeature.mockResolvedValue({ ok: true, value: true });
  m.requireUser.mockResolvedValue({ ok: true, value: uid });
  m.checkEnhanceAllowance.mockResolvedValue({ ok: true, value: allowance.allowance });
  m.readEnhanceAllowance.mockResolvedValue(allowance);
  m.getProfile.mockResolvedValue({ resumeJson: resume() });
  m.enhance.mockResolvedValue({ ok: true, value: { proposals } });
});

describe("enhanceProfile action", () => {
  it("returns filtered proposals, duplicate-skill removals, questions and status", async () => {
    const r = await enhanceProfile();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.proposals).toEqual([
      { path: "work.0.highlights.1", kind: "tidy", before: "helped with  the design system", after: "Helped with the design system.", reason: "Capitalisation and spacing." },
      { path: "skills.1", kind: "remove", before: "react ", after: null, reason: 'Listed twice — same as "React".' },
    ]);
    expect(r.value.questions.map((q) => q.id)).toEqual(["summary"]);
    expect(r.value.dropped).toBe(1);
    expect(r.value.status).toEqual({ left: 1, nextAt: null, reason: "ok" });
    const arg = m.enhance.mock.calls[0][0];
    expect(arg.clerkUserId).toBe(uid);
    expect(arg.fields.map((f: { path: string }) => f.path)).toEqual(["work.0.highlights.0", "work.0.highlights.1"]);
  });

  it("logs counts only (N7)", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    await enhanceProfile();
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("checkout");
    expect(logged).not.toContain("Asha");
    expect(logged).toContain("fields=2 kept=1 dropped=1 questions=1");
    spy.mockRestore();
  });

  it("returns a feature-off refusal before anything else", async () => {
    const off = { ok: false, error: { code: "feature_off", message: "off" } };
    m.requireFeature.mockResolvedValue(off);
    expect(await enhanceProfile()).toBe(off);
    expect(m.requireUser).not.toHaveBeenCalled();
    expect(m.enhance).not.toHaveBeenCalled();
  });

  it("returns an allowance refusal unchanged and does not call the model", async () => {
    const refusal = { ok: false, error: { code: "quota_exhausted", message: "used", detail: "2026-11-07T08:00:00.000Z" } };
    m.checkEnhanceAllowance.mockResolvedValue(refusal);
    expect(await enhanceProfile()).toBe(refusal);
    expect(m.enhance).not.toHaveBeenCalled();
  });

  it("never touches the fair-use meter", async () => {
    await enhanceProfile();
    expect(m.checkTokenAllowance).not.toHaveBeenCalled();
  });

  it("with no enhanceable fields, skips the model and still returns questions", async () => {
    const r0 = resume();
    r0.work[0].highlights = [];
    r0.work[0].summary = "";
    r0.work = [r0.work[0]];
    m.getProfile.mockResolvedValue({ resumeJson: r0 });
    const r = await enhanceProfile();
    expect(m.enhance).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.questions.length).toBeGreaterThan(0);
      expect(r.value.dropped).toBe(0);
    }
  });

  it("passes a model error through unchanged", async () => {
    const e = { ok: false, error: { code: "ai_failed", message: "no" } };
    m.enhance.mockResolvedValue(e);
    expect(await enhanceProfile()).toBe(e);
  });

  it("refuses a burst: the third call in a minute", async () => {
    await enhanceProfile();
    await enhanceProfile();
    const third = await enhanceProfile();
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error.code).toBe("invalid_input");
    expect(m.checkEnhanceAllowance).toHaveBeenCalledTimes(2);
  });

  it("says import first when there is no profile", async () => {
    m.getProfile.mockResolvedValue(null);
    const r = await enhanceProfile();
    expect(!r.ok && r.error.code).toBe("not_found");
  });

  it("LIMITS.enhance is a burst guard", () => {
    expect(LIMITS.enhance).toEqual({ limit: 2, windowSeconds: 60 });
  });
});
