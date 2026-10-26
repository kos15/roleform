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
