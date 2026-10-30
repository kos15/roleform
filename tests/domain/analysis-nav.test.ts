/**
 * The analysis journey: one ordered list of sections that the tab cards, the
 * phone dock, the desktop rail and the "Up next" card all read.
 */
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_SECTIONS,
  dockSplit,
  journeyStep,
  sectionCountLabels,
  sectionFromPath,
  visibleSections,
} from "@/lib/domain/analysis-nav";

const slugs = (s: { slug: string }[]) => s.map((x) => x.slug);

describe("ANALYSIS_SECTIONS", () => {
  it("runs in journey order: tailor, rehearse, learn, plan, track", () => {
    expect(slugs([...ANALYSIS_SECTIONS])).toEqual([
      "resumes",
      "prep",
      "learning",
      "schedule",
      "roadmap",
      "rapid",
      "rounds",
    ]);
  });

  it("gives every section a label, a short label that fits a dock slot, and a pitch", () => {
    for (const s of ANALYSIS_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.short.length).toBeLessThanOrEqual(9);
      expect(s.pitch.length).toBeGreaterThan(0);
    }
  });

  it("never writes a number into a pitch — counts come from the run (§5)", () => {
    for (const s of ANALYSIS_SECTIONS) expect(s.pitch).not.toMatch(/\d/);
  });
});

describe("visibleSections", () => {
  it("drops sections switched off site-wide (F31)", () => {
    expect(slugs(visibleSections(["roadmap", "rapid"]))).toEqual([
      "resumes",
      "prep",
      "learning",
      "schedule",
      "rounds",
    ]);
  });
});

describe("sectionFromPath", () => {
  const id = "abc";
  it("reads the section from its own path", () => {
    expect(sectionFromPath(`/analysis/${id}/prep`, id)).toBe("prep");
    expect(sectionFromPath(`/analysis/${id}/learning`, id)).toBe("learning");
  });
  it("treats a preview as the résumés section", () => {
    expect(sectionFromPath(`/analysis/${id}/preview/clean-slate`, id)).toBe("resumes");
  });
  it("treats a rapid sub-page as rapid", () => {
    expect(sectionFromPath(`/analysis/${id}/rapid/quiz`, id)).toBe("rapid");
  });
  it("is null off the sections — the portfolio, the run screen, another analysis", () => {
    expect(sectionFromPath(`/analysis/${id}/portfolio`, id)).toBeNull();
    expect(sectionFromPath(`/analysis/${id}`, id)).toBeNull();
    expect(sectionFromPath(`/analysis/other/prep`, id)).toBeNull();
  });
});

describe("journeyStep", () => {
  it("numbers the step and names its neighbours", () => {
    const step = journeyStep("prep", []);
    expect(step).toMatchObject({ index: 2, total: 7 });
    expect(step?.prev?.slug).toBe("resumes");
    expect(step?.next?.slug).toBe("learning");
  });
  it("has no previous at the start and no next at the end", () => {
    expect(journeyStep("resumes", [])?.prev).toBeNull();
    expect(journeyStep("rounds", [])?.next).toBeNull();
  });
  it("skips hidden sections when counting and linking", () => {
    const step = journeyStep("learning", ["schedule", "roadmap"]);
    expect(step).toMatchObject({ index: 3, total: 5 });
    expect(step?.next?.slug).toBe("rapid");
  });
  it("is null for a hidden or unknown section", () => {
    expect(journeyStep("roadmap", ["roadmap"])).toBeNull();
    expect(journeyStep(null, [])).toBeNull();
  });
});

describe("dockSplit", () => {
  const all = visibleSections([]);
  it("puts the first four in the dock and the rest behind More", () => {
    const { dock, more } = dockSplit(all, "prep");
    expect(slugs(dock)).toEqual(["resumes", "prep", "learning", "schedule"]);
    expect(slugs(more)).toEqual(["roadmap", "rapid", "rounds"]);
  });
  it("swaps the current section into the last slot so where you are is always visible", () => {
    const { dock, more } = dockSplit(all, "rounds");
    expect(slugs(dock)).toEqual(["resumes", "prep", "learning", "rounds"]);
    expect(slugs(more)).toEqual(["schedule", "roadmap", "rapid"]);
  });
  it("leaves More empty when everything fits", () => {
    const few = visibleSections(["schedule", "roadmap", "rapid"]);
    expect(dockSplit(few, null).more).toEqual([]);
  });
});

describe("sectionCountLabels", () => {
  const counts = {
    resumes: 11,
    questions: 0,
    gaps: 1,
    roadmapProgress: null,
    drills: 0,
    nextRound: null,
    study: "Set a date",
  };
  it("phrases each section's count", () => {
    expect(sectionCountLabels(counts, false)).toEqual({
      resumes: "11",
      prep: "0",
      learning: "1 gap",
      schedule: "Set a date",
      roadmap: "—",
      rapid: "3 drills",
      rounds: "Add one",
    });
  });
  it("says Preparing… rather than a zero while the stage still writes", () => {
    const labels = sectionCountLabels({ ...counts, gaps: 0 }, true);
    expect(labels.prep).toBe("Preparing…");
    expect(labels.learning).toBe("Preparing…");
  });
  it("reads roadmap progress as n/m, never a percentage (N16)", () => {
    expect(sectionCountLabels({ ...counts, roadmapProgress: { done: 3, total: 9 } }, false).roadmap).toBe("3/9");
  });
});
