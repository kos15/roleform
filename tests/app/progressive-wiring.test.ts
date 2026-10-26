import { describe, expect, it } from "vitest";
import { sourceOf } from "../structure/files";

describe("parsing screen", () => {
  const src = sourceOf("app/(app)/analysis/[id]/parsing-screen.tsx");
  it("finishes on parsingFinished, not on stage ③", () => {
    expect(src).toContain("parsingFinished(update)");
    expect(src).not.toMatch(/update\.stage === "rewriting"/);
  });
  it("shows two pips and says the results are ready", () => {
    expect(src).toMatch(/s\.key === "reading" \|\| s\.key === "matching"/);
    expect(src).toContain('done="Your results are ready"');
    expect(src).not.toContain("Your drafts are ready");
  });
});

describe("Résumés tab and preview", () => {
  const resumes = sourceOf("app/(app)/analysis/[id]/resumes/page.tsx");
  const preview = sourceOf("app/(app)/analysis/[id]/preview/[templateId]/page.tsx");
  it("the Résumés tab derives its state and shows the panel", () => {
    for (const s of ["draftsState(", "draftsPerRun(", "<DraftsPlaceholder", "<NotEvidencedPanel", "stillNotEvidenced(scoreAnalysis("]) expect(resumes).toContain(s);
    expect(resumes).not.toContain("The drafts didn't generate");
  });
  it("offers 'Finish the drafts' only on a ready analysis", () => {
    expect(resumes).toContain('canResume={analysis.status === "ready"}');
    expect(preview).toContain('canResume={analysis.status === "ready"}');
  });
  it("the preview waits instead of saying the draft doesn't exist", () => {
    expect(preview).toContain("draftsState(");
    expect(preview).toContain("<DraftsPlaceholder");
  });
});
