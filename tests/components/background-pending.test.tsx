import { expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }) }));
import { DraftsPlaceholder } from "@/components/background-pending";
(globalThis as { React?: typeof React }).React = React;

const html = (state: "pending" | "missing" | "off", extra: { canResume?: boolean } = {}) =>
  renderToStaticMarkup(createElement(DraftsPlaceholder, { state, analysisId: "a1", ...extra }));

it("pending: a status loader, no button", () => { const h = html("pending"); expect(h).toContain("Writing your drafts"); expect(h).toContain('role="status"'); expect(h).not.toContain("<button"); });
it("missing: offers to finish the drafts", () => { expect(html("missing")).toContain("The drafts didn"); expect(html("missing")).toContain("Finish the drafts"); });
it("missing on an analysis that is not ready: the empty state, no button", () => {
  const h = html("missing", { canResume: false });
  expect(h).toContain("The drafts didn");
  expect(h).not.toContain("Finish the drafts");
  expect(h).not.toContain("<button");
});
it("off: says so and offers nothing", () => { const h = html("off"); expect(h).toContain("Drafts are off for your account"); expect(h).not.toContain("<button"); });
it("never names a draft count (§5)", () => { for (const s of ["pending", "missing", "off"] as const) expect(html(s)).not.toMatch(/\b\d+\s+drafts?\b/i); });
