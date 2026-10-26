import { describe, expect, it } from "vitest";
import { laneOf } from "@/lib/domain/lanes";
import { AGENTS } from "@/lib/ai/agents/roster";

describe("test harness", () => {
  it("resolves the @ alias", () => {
    expect(laneOf("video")).toBe("watch");
  });

  it("stubs server-only so server modules import under test", () => {
    expect(Object.keys(AGENTS).length).toBeGreaterThan(0);
  });
});
