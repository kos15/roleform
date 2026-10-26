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
