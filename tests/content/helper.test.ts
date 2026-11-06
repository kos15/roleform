import assert from "node:assert/strict";
import { it } from "vitest";
import { HELP } from "@/lib/content/helper";

it("the 'big number' tip points at the score ring, not the requirement disclosure", () => {
  const tip = HELP.resumes.tips.find((t) => t.text.includes("big number"));
  assert.ok(tip, "tip missing");
  assert.equal(tip.target, "score");
});
