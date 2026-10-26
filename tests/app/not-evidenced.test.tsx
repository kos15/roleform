import { expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement("a", { href, ...rest }, children),
  useLinkStatus: () => ({ pending: false }),
}));
import { NotEvidencedPanel } from "@/app/(app)/analysis/[id]/resumes/not-evidenced";
(globalThis as { React?: typeof React }).React = React;

const items = [{ label: "Kubernetes", necessity: "required" as const }, { label: "Terraform", necessity: "preferred" as const }];
const html = renderToStaticMarkup(createElement(NotEvidencedPanel, { analysisId: "a1", items }));
it("titles the panel and keeps the order it was given", () => { expect(html).toContain("Still not evidenced"); expect(html.indexOf("Kubernetes")).toBeLessThan(html.indexOf("Terraform")); });
it("links to Learning filtered to these skills", () => expect(html).toContain('href="/analysis/a1/learning?skills=Kubernetes%2CTerraform"'));
it("uses DS tokens only — no hex, no ad-hoc radius (N9)", () => { expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i); expect(html).not.toMatch(/rounded-\[/); });
it("renders nothing when everything is evidenced", () =>
  expect(renderToStaticMarkup(createElement(NotEvidencedPanel, { analysisId: "a1", items: [] }))).toBe(""));
