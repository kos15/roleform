import { describe, expect, it } from "vitest";
import { z } from "zod";
import { profileEnhanceSchema } from "@/lib/ai/schemas/profile-enhance";

const s = profileEnhanceSchema([
  { path: "basics.summary", text: "x" },
  { path: "work.0.highlights.0", text: "y" },
]);
const edit = (over: Record<string, unknown> = {}) => ({
  kind: "rephrase",
  path: "basics.summary",
  text: "better",
  reason: "r",
  ...over,
});
const ok = (proposals: unknown[]) => s.safeParse({ proposals }).success;

describe("profileEnhanceSchema", () => {
  it("accepts a rephrase and a remove", () => {
    expect(ok([edit()])).toBe(true);
    expect(ok([{ kind: "remove", path: "work.0.highlights.0", reason: "r" }])).toBe(true);
  });
  it("rejects remove on a summary, unknown path, empty text", () => {
    expect(ok([{ kind: "remove", path: "basics.summary", reason: "r" }])).toBe(false);
    expect(ok([edit({ kind: "tidy", path: "work.9.highlights.0" })])).toBe(false);
    expect(ok([edit({ text: "" })])).toBe(false);
  });
  it("bounds the reason at 140", () => {
    expect(ok([edit({ reason: "a".repeat(141) })])).toBe(false);
    expect(ok([edit({ reason: "a".repeat(140) })])).toBe(true);
  });
  it("rejects 41 proposals", () => {
    expect(ok(Array.from({ length: 41 }, () => edit()))).toBe(false);
    expect(ok(Array.from({ length: 40 }, () => edit()))).toBe(true);
  });
  it("emits anyOf, never oneOf, and has no url field", () => {
    const json = JSON.stringify(z.toJSONSchema(s));
    expect(json).toContain('"anyOf"');
    expect(json).not.toContain('"oneOf"');
    expect(json).not.toMatch(/"url"/);
  });
  it("with no highlight paths, rejects any remove", () => {
    const only = profileEnhanceSchema([{ path: "basics.summary", text: "x" }]);
    expect(only.safeParse({ proposals: [{ kind: "remove", path: "basics.summary", reason: "r" }] }).success).toBe(false);
    expect(only.safeParse({ proposals: [edit()] }).success).toBe(true);
  });
});
