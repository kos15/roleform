import { describe, expect, it } from "vitest";
import { isProductionBuild, skipLine } from "@/scripts/deploy/gate";

describe("deploy gate", () => {
  it("production → true", () => expect(isProductionBuild({ VERCEL_ENV: "production" })).toBe(true));
  it.each(["preview", "development", "Production", " production", ""])("%j → false", (v) =>
    expect(isProductionBuild({ VERCEL_ENV: v })).toBe(false));
  it("undefined → false", () => expect(isProductionBuild({ VERCEL_ENV: undefined })).toBe(false));
  it("unset → false", () => expect(isProductionBuild({})).toBe(false));
  it("skip line names the step and the value", () => {
    expect(skipLine("catalog", {})).toBe("[deploy:catalog] skipped (VERCEL_ENV=unset)");
    expect(skipLine("schedule", { VERCEL_ENV: "preview" })).toBe("[deploy:schedule] skipped (VERCEL_ENV=preview)");
  });
});
