import { expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ usePathname: () => "/analysis/a1/resumes" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children),
  useLinkStatus: () => ({ pending: false }),
}));
import { AnalysisTabs, type TabCounts } from "@/app/(app)/analysis/[id]/analysis-tabs";
(globalThis as { React?: typeof React }).React = React;
const counts: TabCounts = { resumes: 0, questions: 0, gaps: 0, roadmapProgress: null, drills: 0, nextRound: null, study: "Set a date" };
const resumesCount = (c: TabCounts, generating: boolean) =>
  renderToStaticMarkup(createElement(AnalysisTabs, { analysisId: "a1", counts: c, generating }))
    .match(/href="\/analysis\/a1\/resumes"[\s\S]*?<span class="tab-count">([^<]*)<\/span>/)?.[1];
it("reads Preparing… while drafts are generating", () => expect(resumesCount(counts, true)).toBe("Preparing…"));
it("reads the count once drafts exist", () => expect(resumesCount({ ...counts, resumes: 4 }, true)).toBe("4"));
it("reads 0 once nothing is generating", () => expect(resumesCount(counts, false)).toBe("0"));
