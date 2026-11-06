import { describe, expect, it } from "vitest";
import { ENHANCE_PURPOSE } from "@/lib/domain/enhance";
import { UNMETERED_PURPOSES, meteredRunsWhere } from "@/lib/domain/tokens";

describe("unmetered purposes", () => {
  it("names enhance_profile and nothing else", () => {
    expect(UNMETERED_PURPOSES).toEqual(["enhance_profile"]);
    expect(UNMETERED_PURPOSES).toContain(ENHANCE_PURPOSE);
  });

  it("meteredRunsWhere excludes them", () => {
    const d = new Date("2026-11-01T00:00:00Z");
    expect(meteredRunsWhere("u1", d)).toEqual({
      clerkUserId: "u1",
      createdAt: { gte: d },
      purpose: { notIn: ["enhance_profile"] },
    });
  });
});
