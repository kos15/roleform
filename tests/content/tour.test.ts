import assert from "node:assert/strict";
import { it } from "vitest";
import { TOUR_STEPS } from "@/lib/content/tour";

it("the coverage step tells the member to open the list first", () => {
  const step = TOUR_STEPS.find((s) => s.key === "coverage");
  assert.ok(step, "coverage step missing");
  assert.ok(step.body.includes("Open the list, then any requirement"));
});
