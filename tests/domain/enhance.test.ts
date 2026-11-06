import { describe, expect, it } from "vitest";
import {
  ENHANCE_ATTEMPTS_PER_DAY,
  ENHANCE_LIMIT_COPY,
  ENHANCE_PER_DAY,
  ENHANCE_PURPOSE,
  enhanceAllowance,
  enhanceView,
  duplicateSkillProposals,
  enhanceableFields,
  filterProposals,
  numbersPreserved,
  applyProposals,
  preselected,
  addsClaim,
  profileQuestions,
  type AnsweredQuestion,
  type ProfileProposal,
} from "@/lib/domain/enhance";
import { checkFabrication } from "@/lib/domain/fabrication";
import type { EnhanceProposalOut } from "@/lib/ai/schemas/profile-enhance";
import { base } from "./enhance.fixtures";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const at = (iso: string, schemaValid = true) => ({ createdAt: new Date(iso), schemaValid });
const run = (rows: ReturnType<typeof at>[], role: "member" | "admin" = "member") =>
  enhanceAllowance({ role, rows, now: NOW });

describe("enhanceAllowance", () => {
  it("constants", () => {
    expect(ENHANCE_PURPOSE).toBe("enhance_profile");
    expect(ENHANCE_PER_DAY).toBe(2);
    expect(ENHANCE_ATTEMPTS_PER_DAY).toBe(6);
  });

  it("fresh member has two", () => {
    expect(run([])).toEqual({ allowed: true, used: 0, left: 2, nextAt: null, reason: "ok" });
  });

  it("two valid runs close it until the older one is 24h old", () => {
    expect(run([at("2026-11-06T10:00:00Z"), at("2026-11-06T08:00:00Z")])).toEqual({
      allowed: false,
      used: 2,
      left: 0,
      nextAt: new Date("2026-11-07T08:00:00Z"),
      reason: "used",
    });
  });

  it("a run exactly 24h old is outside the window", () => {
    const r = run([at("2026-11-05T12:00:00Z"), at("2026-11-06T10:00:00Z")]);
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
    expect(r.left).toBe(1);
  });

  it("six failed attempts close it without spending one", () => {
    const rows = [6, 7, 8, 9, 10, 11].map((h) => at(`2026-11-06T${String(h).padStart(2, "0")}:00:00Z`, false));
    expect(run(rows)).toEqual({
      allowed: false,
      used: 0,
      left: 2,
      nextAt: new Date("2026-11-07T06:00:00Z"),
      reason: "attempts",
    });
  });

  it("both exhausted → latest reopening wins", () => {
    const r = run([
      at("2026-11-06T08:00:00Z"),
      at("2026-11-06T09:00:00Z"),
      at("2026-11-06T07:00:00Z", false),
      at("2026-11-06T10:00:00Z", false),
      at("2026-11-06T10:30:00Z", false),
      at("2026-11-06T11:00:00Z", false),
    ]);
    expect(r.reason).toBe("used");
    expect(r.nextAt).toEqual(new Date("2026-11-07T08:00:00Z"));
  });

  it("admin is uncapped but measured", () => {
    const rows = [
      at("2026-11-06T01:00:00Z"),
      at("2026-11-06T02:00:00Z"),
      at("2026-11-06T03:00:00Z"),
      at("2026-11-06T04:00:00Z"),
      at("2026-11-06T05:00:00Z"),
      at("2026-11-06T06:00:00Z", false),
      at("2026-11-06T07:00:00Z", false),
      at("2026-11-06T08:00:00Z", false),
    ];
    expect(run(rows, "admin")).toEqual({
      allowed: true,
      used: 5,
      left: Infinity,
      nextAt: null,
      reason: "ok",
    });
  });

  it("the copy names the constant", () => {
    expect(ENHANCE_LIMIT_COPY).toContain(String(ENHANCE_PER_DAY));
  });
});

describe("enhanceView", () => {
  const used = run([at("2026-11-06T10:00:00Z"), at("2026-11-06T08:00:00Z")]);

  it("maps a used result", () => {
    expect(enhanceView(used, null)).toEqual({
      left: 0,
      nextAt: "2026-11-07T08:00:00.000Z",
      reason: "used",
    });
  });

  it("admin has left null", () => {
    expect(enhanceView(run([], "admin"), null).left).toBeNull();
  });

  it("a block wins", () => {
    expect(enhanceView(run([]), "suspended")).toEqual({ left: 0, nextAt: null, reason: "suspended" });
  });
});

describe("enhanceableFields", () => {
  it("fields are content only, in document order", () => {
    const fields = enhanceableFields(base());
    expect(fields.map((f) => f.path)).toEqual([
      "work.0.highlights.0",
      "work.0.highlights.1",
      "work.0.highlights.2",
      "work.0.highlights.3",
      "work.1.summary",
    ]);
    const json = JSON.stringify(fields);
    for (const s of ["Asha", "asha@example.com", "98765", "Pune", "github.com", "budget.example"]) {
      expect(json).not.toContain(s);
    }
  });

  it("capped at 80", () => {
    const r = base();
    r.work[0].highlights = Array.from({ length: 100 }, (_, i) => `Bullet ${i}`);
    expect(enhanceableFields(r)).toHaveLength(80);
  });
});

describe("numbersPreserved", () => {
  it("keeps numbers in any order", () => {
    expect(numbersPreserved("Cut costs by $1.4m across 3 teams", "Across 3 teams, cut costs by $1.4m")).toBe(true);
  });
  it("normalises spacing before %", () => {
    expect(numbersPreserved("Grew users 40 %", "Grew users 40%")).toBe(true);
  });
  it("a number turned into a word is lost", () => {
    expect(numbersPreserved("Led 5 engineers", "Led five engineers")).toBe(false);
  });
  it("no numbers, nothing to lose", () => {
    expect(numbersPreserved("No numbers here", "Anything")).toBe(true);
  });
});

describe("filterProposals", () => {
  const S = { path: "basics.summary", text: "Frontend engineer who builds fast checkout flows." };
  const H0 = { path: "work.0.highlights.0", text: "Cut checkout load time by 40% using React." };
  const H1 = { path: "work.0.highlights.1", text: "helped with  the design system" };
  const H2 = { path: "work.0.highlights.2", text: "Helped with the design system." };
  const fields = [S, H0, H1, H2];
  const edit = (f: { path: string }, text: string, kind: "rephrase" | "tidy" = "rephrase"): EnhanceProposalOut => ({
    kind,
    path: f.path,
    text,
    reason: "r",
  });
  const remove = (f: { path: string }): EnhanceProposalOut => ({ kind: "remove", path: f.path, reason: "r" });
  const f = (p: EnhanceProposalOut[], terms: string[] = ["React"]) => filterProposals(fields, p, terms);

  it("keeps a clean tidy", () => {
    const { kept, dropped } = f([edit(H1, "Helped with the design system.", "tidy")]);
    expect(dropped).toBe(0);
    expect(kept[0]).toEqual({
      path: H1.path,
      kind: "tidy",
      before: "helped with  the design system",
      after: "Helped with the design system.",
      reason: "r",
    });
  });
  it("drops seniority", () => {
    expect(f([edit(S, "Senior frontend engineer who builds fast checkout flows.")]).kept).toEqual([]);
  });
  it("drops a lost number", () => {
    expect(f([edit(H0, "Cut checkout load time sharply using React.")]).kept).toEqual([]);
  });
  it("drops an added number", () => {
    expect(f([edit(H2, "Helped with the design system for 3 teams.")]).kept).toEqual([]);
  });
  it("drops a new tool", () => {
    expect(f([edit(H2, "Helped with the design system in GraphQL.")]).kept).toEqual([]);
  });
  it("keeps a listed tool", () => {
    expect(f([edit(H2, "Helped with the design system in GraphQL.")], ["GraphQL"]).kept).toHaveLength(1);
  });
  it("drops a no-op", () => {
    expect(f([edit(H2, "  Helped with the design system.  ")]).kept).toEqual([]);
  });
  it("first proposal per path only", () => {
    const r = f([edit(H1, "Helped with the design system.", "tidy"), edit(H1, "Helped on the design system.")]);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toBe(1);
  });
  it("unknown path dropped", () => {
    expect(f([edit({ path: "work.9.highlights.0" }, "x")]).kept).toEqual([]);
  });
  it("remove on a non-highlight dropped", () => {
    expect(f([remove(S)]).kept).toEqual([]);
  });
  it("remove of a bullet carrying a number dropped", () => {
    expect(f([remove(H0)]).kept).toEqual([]);
  });
  it("remove kept", () => {
    const { kept } = f([remove(H2)]);
    expect(kept[0]).toMatchObject({ kind: "remove", before: H2.text, after: null });
  });
});

describe("duplicateSkillProposals", () => {
  it("first occurrence wins", () => {
    expect(duplicateSkillProposals(base())).toEqual([
      { path: "skills.1", kind: "remove", before: "react ", after: null, reason: 'Listed twice — same as "React".' },
    ]);
  });
});

describe("profileQuestions", () => {
  it("asks in the fixed order", () => {
    const qs = profileQuestions(base());
    expect(qs.map((q) => q.id)).toEqual([
      "summary",
      "work.0.number",
      "work.1.first",
      "projects.0.first",
      "education.0.endDate",
      "projects.0.startDate",
      "certificates.0.date",
    ]);
    expect(qs.find((q) => q.id === "work.1.first")?.target).toEqual({
      kind: "append",
      path: "work.1.highlights",
      owner: "Developer · Beta",
    });
  });

  it("is truncated to 8", () => {
    const r = base();
    r.work = Array.from({ length: 10 }, (_, i) => ({ ...r.work[1], name: `Co${i}`, summary: "" }));
    expect(profileQuestions(r)).toHaveLength(8);
  });
});

const prop = (path: string, kind: ProfileProposal["kind"], before: string, after: string | null): ProfileProposal => ({
  path,
  kind,
  before,
  after,
  reason: "r",
});

describe("preselected", () => {
  it("ticks only tidy; rephrase and remove start unticked", () => {
    expect(
      preselected([
        prop("work.0.highlights.1", "tidy", "B two", "B, two"),
        prop("work.0.highlights.0", "rephrase", "A one", "A uno"),
        prop("work.0.highlights.2", "remove", "C three", null),
      ]),
    ).toEqual(["work.0.highlights.1"]);
  });
});

describe("applyProposals", () => {
  it("two removals in one array, ids follow their text", () => {
    const out = applyProposals(
      base(),
      [prop("work.0.highlights.1", "remove", "B two", null), prop("work.0.highlights.3", "remove", "D four", null)],
      [],
    );
    expect(out.resume.work[0].highlights).toEqual(["A one", "C three"]);
    expect(out.resume.x_roleform?.bulletIds).toEqual({
      "work.0.highlights.0": "id-a",
      "work.0.highlights.1": "id-c",
    });
    expect({ applied: out.applied, skipped: out.skipped }).toEqual({ applied: 2, skipped: 0 });
  });

  it("rephrase and remove together", () => {
    const out = applyProposals(
      base(),
      [
        prop("work.0.highlights.2", "rephrase", "C three", "C, three"),
        prop("work.0.highlights.0", "remove", "A one", null),
      ],
      [],
    );
    expect(out.resume.work[0].highlights).toEqual(["B two", "C, three", "D four"]);
    expect(out.resume.x_roleform?.bulletIds).toEqual({
      "work.0.highlights.0": "id-b",
      "work.0.highlights.1": "id-c",
      "work.0.highlights.2": "id-d",
    });
  });

  it("stale before is skipped", () => {
    const out = applyProposals(base(), [prop("work.0.highlights.0", "rephrase", "A ONE", "A uno")], []);
    expect(out.skipped).toBe(1);
    expect(out.resume.work[0].highlights[0]).toBe("A one");
  });

  it("duplicate skill removed", () => {
    const out = applyProposals(base(), [prop("skills.1", "remove", "react ", null)], []);
    expect(out.resume.skills.map((s) => s.name)).toEqual(["React", "TypeScript"]);
  });

  describe("answers", () => {
    const q = (id: string) => profileQuestions(base()).find((x) => x.id === id)!;
    const ans = (id: string, answer: string): AnsweredQuestion => ({ question: q(id), answer });

    it("summary is trimmed and set", () => {
      const out = applyProposals(base(), [], [ans("summary", "  Frontend engineer.  ")]);
      expect(out.resume.basics.summary).toBe("Frontend engineer.");
      expect(out.applied).toBe(1);
    });
    it("an append lands at the end", () => {
      const out = applyProposals(base(), [], [ans("work.1.first", "Shipped the loyalty app.")]);
      expect(out.resume.work[1].highlights).toEqual(["Shipped the loyalty app."]);
    });
    it("a changed owner is skipped", () => {
      const a = ans("work.1.first", "Shipped the loyalty app.");
      if (a.question.target.kind === "append") a.question.target.owner = "Developer · Gamma";
      const out = applyProposals(base(), [], [a]);
      expect(out.skipped).toBe(1);
      expect(out.resume.work[1].highlights).toEqual([]);
    });
    it("blank is neither applied nor skipped", () => {
      const out = applyProposals(base(), [], [ans("summary", "   ")]);
      expect({ applied: out.applied, skipped: out.skipped }).toEqual({ applied: 0, skipped: 0 });
    });
    it("dates must be YYYY or YYYY-MM", () => {
      expect(applyProposals(base(), [], [ans("education.0.endDate", "2019-13")]).skipped).toBe(1);
      const ok = applyProposals(base(), [], [ans("education.0.endDate", "2019-06")]);
      expect(ok.applied).toBe(1);
      expect(ok.resume.education[0].endDate).toBe("2019-06");
    });
    it("over 1000 characters is skipped", () => {
      expect(applyProposals(base(), [], [ans("summary", "x".repeat(1001))]).skipped).toBe(1);
    });
    it("set never overwrites an existing value", () => {
      const r = base();
      r.basics.summary = "Mine.";
      const out = applyProposals(r, [], [ans("summary", "Other.")]);
      expect(out.skipped).toBe(1);
      expect(out.resume.basics.summary).toBe("Mine.");
    });
  });

  it("input is not mutated", () => {
    const r = base();
    const c = structuredClone(r);
    applyProposals(
      r,
      [prop("work.0.highlights.1", "remove", "B two", null), prop("work.0.highlights.2", "tidy", "C three", "C, three")],
      [{ question: profileQuestions(r)[0], answer: "Hello." }],
    );
    expect(r).toEqual(c);
  });
});

describe("Enhance-only claim guard", () => {
  const SRC = "Helped with the design system.";
  const ENG = "Frontend engineer who builds fast checkout flows.";
  const dropped = (src: string, after: string, terms: string[] = ["React"]) => {
    const fields = [{ path: "work.0.highlights.0", text: src }];
    const r = filterProposals(fields, [{ kind: "rephrase", path: fields[0].path, text: after, reason: "r" }], terms);
    return r.kept.length === 0 && r.dropped === 1;
  };

  it.each([
    [SRC, "Led the design system."],
    [SRC, "Owned and architected the design system."],
    [SRC, "Helped with the design system in Figma."],
    [SRC, "Helped with the design system using Kubernetes and Terraform."],
    [SRC, "Helped a team of twelve engineers with the design system."],
    [SRC, "Helped with the design system used by thousands of customers."],
    [SRC, "Helped with the global design system."],
    [SRC, "Helped with the large-scale design system."],
    [ENG, "Lead frontend engineer who builds fast checkout flows."],
    [ENG, "Tech lead who builds fast checkout flows."],
    [ENG, "Engineering manager who builds fast checkout flows."],
    [SRC, "Helped with the design system, see https://x.example."],
  ])("drops %j -> %j", (src, after) => {
    expect(dropped(src, after)).toBe(true);
  });

  it("keeps a pure rephrase with the same nouns", () => {
    expect(dropped(SRC, "Contributed to the design system.")).toBe(false);
  });
  it("keeps a tidy that fixes case", () => {
    expect(dropped("we shipped the checkout flow", "We shipped the checkout flow.")).toBe(false);
  });
  it("allows a capitalised word the source or profile states", () => {
    expect(addsClaim("Used React daily", "Used React every day.", [])).toBe(false);
    expect(addsClaim("Built it", "Built it with Figma.", ["Figma"])).toBe(false);
    expect(addsClaim("Built it", "Then I built it.", [])).toBe(false);
  });
});

describe("applyProposals edge cases", () => {
  it("a duplicate removal counts once", () => {
    const p = prop("work.0.highlights.1", "remove", "B two", null);
    const out = applyProposals(base(), [p, p], []);
    expect({ applied: out.applied, skipped: out.skipped }).toEqual({ applied: 1, skipped: 0 });
    expect(out.resume.work[0].highlights).toEqual(["A one", "C three", "D four"]);
  });

  it("removes inside project highlights and re-keys their ids", () => {
    const r = base();
    r.projects[0].highlights = ["P0", "P1", "P2"];
    r.x_roleform!.bulletIds["projects.0.highlights.0"] = "p-a";
    r.x_roleform!.bulletIds["projects.0.highlights.1"] = "p-b";
    r.x_roleform!.bulletIds["projects.0.highlights.2"] = "p-c";
    const out = applyProposals(r, [prop("projects.0.highlights.0", "remove", "P0", null)], []);
    expect(out.resume.projects[0].highlights).toEqual(["P1", "P2"]);
    const ids = out.resume.x_roleform!.bulletIds;
    expect(ids["projects.0.highlights.0"]).toBe("p-b");
    expect(ids["projects.0.highlights.1"]).toBe("p-c");
    expect(ids["projects.0.highlights.2"]).toBeUndefined();
    expect(ids["work.0.highlights.0"]).toBe("id-a");
  });

  it("leaves another role's ids alone", () => {
    const r = base();
    r.work[1].highlights = ["X0", "X1"];
    r.x_roleform!.bulletIds["work.1.highlights.0"] = "x-a";
    r.x_roleform!.bulletIds["work.1.highlights.1"] = "x-b";
    const out = applyProposals(r, [prop("work.0.highlights.0", "remove", "A one", null)], []);
    const ids = out.resume.x_roleform!.bulletIds;
    expect(ids["work.1.highlights.0"]).toBe("x-a");
    expect(ids["work.1.highlights.1"]).toBe("x-b");
  });

  it("removing the last bullet, then every bullet", () => {
    const last = applyProposals(base(), [prop("work.0.highlights.3", "remove", "D four", null)], []);
    expect(last.resume.work[0].highlights).toEqual(["A one", "B two", "C three"]);
    expect(last.resume.x_roleform!.bulletIds["work.0.highlights.3"]).toBeUndefined();

    const all = applyProposals(
      base(),
      ["A one", "B two", "C three", "D four"].map((t, i) => prop(`work.0.highlights.${i}`, "remove", t, null)),
      [],
    );
    expect(all.resume.work[0].highlights).toEqual([]);
    expect(all.resume.x_roleform!.bulletIds).toEqual({});
    expect(all.applied).toBe(4);
  });
});

describe("addsClaim compares whole words and hyphen compounds", () => {
  const DROP: [string, string, string[]][] = [
    ["Maintained the checkout flow.", "Maintained the AI checkout flow.", []],
    ["Built pages in HTML.", "Built ML pages in HTML.", []],
    ["Shipped a checkout a year ago.", "Shipped a good Go checkout a year ago.", []],
    ["Wrote JavaScript widgets.", "Wrote Java and JavaScript widgets.", []],
    ["Built trusted checkout.", "Built trusted checkout in Rust.", []],
    ["Built trusted checkout.", "Built trusted checkout with AI.", ["Tailwind"]],
    ["co-led the migration", "Led the migration.", []],
    ["Added auth to login.", "Added twenty-five auth methods to login.", []],
    ["Built components.", "Built React-based components.", []],
  ];
  it.each(DROP)("drops %j -> %j", (src, after, terms) => {
    expect(addsClaim(src, after, terms)).toBe(true);
  });

  const KEEP: [string, string, string[]][] = [
    ["Added two-factor auth to login.", "Added two-factor authentication to login.", []],
    ["Built one-click checkout.", "Built a one-click checkout flow.", []],
    ["co-led the migration", "Co-led the migration.", []],
    ["Built React components.", "Built React-based checkout components.", []],
    ["Built the design system with Storybook.", "Built the Storybook-driven design system.", []],
    ["Shipped checkout at Google.", "Shipped Google's checkout.", []],
  ];
  it.each(KEEP)("keeps %j -> %j", (src, after, terms) => {
    expect(addsClaim(src, after, terms)).toBe(false);
  });
});

describe("the URL guard on its own", () => {
  it("is the only thing that drops a pasted link", () => {
    const src = "Built the Acme.com checkout.";
    const after = "Built the https://acme.com checkout.";
    expect(checkFabrication({ source: src, rewritten: after, profileTerms: [] })).toEqual([]);
    expect(addsClaim(src, after, [])).toBe(false);
    const fields = [{ path: "work.0.highlights.0", text: src }];
    const r = filterProposals(fields, [{ kind: "rephrase", path: fields[0].path, text: after, reason: "r" }], []);
    expect(r).toEqual({ kept: [], dropped: 1 });
  });
});
