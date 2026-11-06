import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURES } from "@/lib/domain/features";

describe("feature switches", () => {
  it("the Prisma FeatureKey enum and FEATURES list the same keys", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const body = schema.match(/enum FeatureKey \{([\s\S]*?)\n\}/)![1];
    const values = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("///") && !l.startsWith("@@"))
      .sort();
    expect(values).toEqual(FEATURES.map((f) => f.key).sort());
  });

  it("profile_enhance is a switch", () => {
    expect(FEATURES.find((f) => f.key === "profile_enhance")).toEqual({
      key: "profile_enhance",
      label: "Profile enhance",
      description: "The Enhance button on the profile. Saved profiles are untouched.",
    });
  });

  it("its migration is one additive enum value", () => {
    const sql = readFileSync("prisma/migrations/20261106000000_feature_profile_enhance/migration.sql", "utf8");
    expect(sql.trim()).toBe(`-- AlterEnum\nALTER TYPE "feature_key" ADD VALUE 'profile_enhance';`);
  });
});
