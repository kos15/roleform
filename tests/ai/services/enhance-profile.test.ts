import { beforeEach, describe, expect, it, vi } from "vitest";

const runAgent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/agents/define", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/agents/define")>()),
  runAgent,
}));

import { enhanceProfile } from "@/lib/ai/services/enhance-profile";
import { profileEnhancer } from "@/lib/ai/agents/profile-enhancer";

const P = { kind: "tidy" as const, path: "basics.summary", text: "Fixed.", reason: "Spacing." };
const fields = [{ path: "basics.summary", text: "fixed" }];

describe("enhanceProfile service", () => {
  beforeEach(() => runAgent.mockReset());

  it("returns the proposals and passes no analysisId", async () => {
    runAgent.mockResolvedValue({
      ok: true,
      value: { value: { proposals: [P] }, aiRunId: "r1", retryCount: 0, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
    });
    const r = await enhanceProfile({ clerkUserId: "u1", fields });
    expect(r).toEqual({ ok: true, value: { proposals: [P] } });
    expect(runAgent).toHaveBeenCalledWith(profileEnhancer, { fields }, { clerkUserId: "u1" });
  });

  it("passes an error through unchanged", async () => {
    const e = { ok: false, error: { code: "ai_failed", message: "no" } };
    runAgent.mockResolvedValue(e);
    expect(await enhanceProfile({ clerkUserId: "u1", fields })).toBe(e);
  });
});
