import { describe, expect, it } from "vitest";
import { checkFabrication, numbersIn } from "@/lib/domain/fabrication";

describe("checkFabrication numbers", () => {
  it("a trailing full stop is not a different number", () => {
    expect(checkFabrication({ source: "Cut time by 40", rewritten: "Cut time by 40.", profileTerms: [] })).toEqual([]);
  });
  it("a changed number is still a metric finding", () => {
    const f = checkFabrication({ source: "Cut time by 40", rewritten: "Cut time by 45", profileTerms: [] });
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe("metric");
  });
});

describe("a sentence-final tool", () => {
  it("is matched against the source without its full stop", () => {
    expect(
      checkFabrication({ source: "Built GraphQL APIs", rewritten: "Built APIs in GraphQL.", profileTerms: [] }),
    ).toEqual([]);
    expect(checkFabrication({ source: "Shipped on AWS", rewritten: "Shipped on AWS.", profileTerms: [] })).toEqual([]);
  });
  it("a tool the source and profile lack is still a finding", () => {
    const f = checkFabrication({ source: "Built APIs", rewritten: "Built APIs in GraphQL.", profileTerms: [] });
    expect(f.map((x) => x.kind)).toEqual(["tool"]);
  });
});

describe("numbersIn", () => {
  it("drops trailing punctuation only", () => {
    expect(numbersIn("v2.")).toEqual(["2"]);
    expect(numbersIn("3.5.")).toEqual(["3.5"]);
    expect(numbersIn("1,000,")).toEqual(["1000"]);
    expect(numbersIn("$1.4m.")).toEqual(["$1.4m"]);
  });
});
