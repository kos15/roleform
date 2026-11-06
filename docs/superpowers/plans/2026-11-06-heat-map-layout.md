<!-- Decisions confirmed by the user 2026-11-06: requirement tags closed by default (decision 1); compact one-row tab cards (Task 5). Tabs not sticky; no 48h special case on History. -->

# Heat-map layout, Part A plan

**Goal.** On every main signed-in surface, the thing the member came for sits in the first screen at 1280×800 and 390×844. Supporting content moves to a side rail or below the main component. This is a layout and ordering change: no new DS tokens, and no visual redesign beyond the density changes named in each task.

**Architecture.**
- Two small shared pieces:
  - `components/with-rail.tsx` (`WithRail`): main column first in the DOM, a rail to the right from `lg`, the rail below on phones, and an empty rail takes no room.
  - `PageIntro` gains an `actions` slot and a `compact` mode with one app-title size, `APP_TITLE`.
- Each page then reorders its own JSX.
- The analysis header becomes one compact band, with the ring and its three bucket counts in one card.

**Global constraints.**
- **§11:** every ordering or behaviour change starts with a failing Vitest test in `tests/` that mirrors the module. Pure spacing and size tweaks (Tasks 5 and 12, plus the size lines inside other tasks) are checked visually (§11, last paragraph) and say so.
- **N4:**
  - The ring never renders without all three bucket counts in the same card, at every width.
  - The bucket list never carries `.more-copy` or a `hidden`/`sm:` class (specs F0).
  - The text never says "ATS score".
- **§5:** no draft count written into new copy.
- **N9 / §9:** only `var(--color-*)`, `var(--radius-*)` and the DS classes (`.tag`, `.btn`, `.card`, `.note`, `.eyebrow`). Any new radius is `var(--radius-lg)`, not `26px`. Lucide icons use `.lucide`.
- **§10:** the new component goes in `components/`, and new tests in `tests/app/` and `tests/components/`.
- **§13 vocabulary:** unchanged.
- **§14:** add the PENDING lines before the first failing test, and strike each in its task's commit.
- **§15.7:** each task updates the spec paragraph its change makes false.

## PENDING.md lines to add

```
## Heat-map layout, Part A — `docs/superpowers/plans/2026-11-06-heat-map-layout.md`

- [ ] Task 1: `components/with-rail.tsx` — main column + side rail (right from `lg`, below on phones, an empty rail takes no room)
- [ ] Task 2: `PageIntro` — `actions` slot and `compact` app title (`APP_TITLE`); marketing markup byte-identical
- [ ] Task 3: results header — one compact band; the ring card carries all three bucket counts (N4); requirement tags in one closed disclosure; decorative card removed; specs F4
- [ ] Task 4: analysis layout — tabs right under the header, no divider, promo strip under the section; specs F32
- [ ] Task 5: tab cards — compact rows from 641px up (one row at 1280)
- [ ] Task 6: Résumés tab — shelf first; skill offer, then portfolio promo, below it
- [ ] Task 7: profile editor — Identity collapsed to one line, Experience before Skills, usage meter in the aside; specs F11
- [ ] Task 8: profile page — header actions slot (Replace résumé; Part B's Enhance lands here), one Account block at the foot; specs F11
- [ ] Task 9: /analyze — posting box first, parked runs in the aside, smaller hero
- [ ] Task 10: /jobs — saved jobs in a side rail, shorter standfirst
- [ ] Task 11: /history — upcoming rounds in a side rail, smaller title; specs F29.1
- [ ] Task 12: portfolio studio — tighter intro
- [ ] Task 13: look at every surface at 1280×800 and 390×844 on the branch's preview deploy
- [ ] History's Match column shows the coverage number with no buckets beside it (N4) — decide: drop the column, or show the three counts — shikamaru, heat-map audit
- [ ] Portfolio promo copy says "Fourteen looks"; `PORTFOLIO_LOOKS` has 18 — phrase from the list or drop the number — shikamaru, heat-map audit
- [ ] `AnalysisSkeleton` (components/skeletons.tsx) is unused (analysis/[id]/loading.tsx returns null) and still draws the old header — delete or wire — shikamaru, heat-map audit
- [ ] Portfolio and preview routes sit under the full results header — consider a slim header off the section path — shikamaru, heat-map audit
```

**Dependencies:**
- Tasks 10 and 11 need Task 1.
- Tasks 8, 9, 10 and 11 need Task 2.
- Task 8 needs Task 7.
- Everything else stands alone.

Each task is one commit and can be reverted on its own.

**Shared test preamble.** Every render test uses the pattern from `tests/app/analysis-journey.test.tsx`:

```ts
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
const has = (h: string, s: string) => assert.ok(h.includes(s), `missing "${s}"`);
const lacks = (h: string, s: string) => assert.ok(!h.includes(s), `unexpected "${s}"`);
```

Source-order tests use `import { sourceOf } from "../structure/files";` and this helper:

```ts
const at = (src: string, s: string) => { const i = src.indexOf(s); assert.ok(i >= 0, `missing ${s}`); return i; };
```

---

### Task 1: `WithRail`

**Files:**
- Create `components/with-rail.tsx`
- Test `tests/components/with-rail.test.tsx` (new folder)

**Interfaces:**
- Produces `export function WithRail({ children, rail, railLabel }: { children: React.ReactNode; rail: React.ReactNode; railLabel: string })`

**Steps:**
- [ ] **Step 1: failing test** `tests/components/with-rail.test.tsx`:
  ```ts
  import { it } from "vitest";
  import { WithRail } from "@/components/with-rail";
  const render = (rail: React.ReactNode) =>
    renderToStaticMarkup(createElement(WithRail, { railLabel: "Saved jobs", rail, children: createElement("p", null, "MAIN") }));

  it("puts the main column first and the labelled rail after it", () => {
    const html = render(createElement("p", null, "RAIL"));
    assert.ok(html.indexOf("MAIN") < html.indexOf("<aside"), "main must precede the rail in the DOM (phones stack it below)");
    assert.match(html, /<aside[^>]*aria-label="Saved jobs"[^>]*>.*RAIL/);
    has(html, "lg:flex-row");
  });

  it("an empty rail renders an empty aside that hides itself", () => {
    assert.match(render(null), /<aside[^>]*class="[^"]*\bempty:hidden\b[^"]*"[^>]*><\/aside>/);
  });
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/components/with-rail.test.tsx`. Expected FAIL: `Failed to resolve import "@/components/with-rail"`.
- [ ] **Step 3: implement** `WithRail` in `components/with-rail.tsx`:
  - Root: `<div className="flex flex-col gap-[clamp(1.75rem,3vw,2.5rem)] lg:flex-row lg:items-start">`
  - Main: `<div className="min-w-0 flex-1">{children}</div>`
  - Rail: `<aside aria-label={railLabel} className="flex min-w-0 flex-col gap-[18px] empty:hidden lg:w-[340px] lg:flex-none">{rail}</aside>`
  - Why flex rather than grid: a hidden flex item takes its gap with it, which a grid track would not.
  - 340px matches the precedent in `rounds/page.tsx`.
  - Add a docstring saying why the DOM order matters (phones) and why `empty:hidden` (`UpcomingRounds` returns null).
- [ ] **Step 4:** run → PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya. Commit intent: `feat(ui): WithRail — a main column with a side rail that drops below on phones`

### Task 2: `PageIntro` actions slot and compact title

**Files:**
- Modify `components/page-intro.tsx`
- Test `tests/components/page-intro.test.tsx`

**Interfaces:**
- Produces `export const APP_TITLE = "text-[clamp(2rem,4.2vw,3.5rem)]";`
- Produces `PageIntro({ kicker, title, children, actions, compact = false }: { kicker: string; title: string; children?: React.ReactNode; actions?: React.ReactNode; compact?: boolean })`

**Steps:**
- [ ] **Step 1: failing tests**
  ```ts
  import { PageIntro, APP_TITLE } from "@/components/page-intro";
  it("without actions or compact, renders exactly as before (marketing pages)", () => {
    assert.equal(
      renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", children: "S" })),
      '<div class="mb-[clamp(2rem,4vw,3rem)] max-w-[62ch]"><p class="eyebrow mb-3.5">K</p><h1 class="mb-[18px]">T</h1><p class="text-[15px] leading-relaxed text-[var(--color-text-muted)] sm:text-[17px]">S</p></div>',
    );
  });
  it("puts actions in a slot after the title", () => {
    const html = renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", actions: createElement("a", { href: "/x" }, "Act") }));
    has(html, 'data-slot="page-actions"');
    assert.ok(html.indexOf("<h1") < html.indexOf('data-slot="page-actions"'));
    assert.match(html, /data-slot="page-actions"[^>]*><a href="\/x">Act<\/a>/);
  });
  it("compact uses the one app title size", () => {
    assert.equal(APP_TITLE, "text-[clamp(2rem,4.2vw,3.5rem)]");
    has(renderToStaticMarkup(createElement(PageIntro, { kicker: "K", title: "T", compact: true })), `<h1 class="mb-3 ${APP_TITLE}">T</h1>`);
  });
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/components/page-intro.test.tsx`. Expected: the first test passes (it pins today's markup). The second fails with `missing "data-slot="page-actions""`. The third fails on `APP_TITLE` being `undefined`.
- [ ] **Step 3: implement.**
  - Build the kicker, title and standfirst once as a fragment.
  - `compact` changes three things: eyebrow `mb-2`, h1 `` `mb-3 ${APP_TITLE}` ``, wrapper `mb-[clamp(1.25rem,2.5vw,2rem)]`.
  - Without `actions`: return the single `max-w-[62ch]` wrapper (byte-identical when not compact).
  - With `actions`: an outer `flex flex-wrap items-end justify-between gap-x-8 gap-y-4` carrying the margin, an inner `min-w-0 max-w-[62ch]` holding the intro, then `<div data-slot="page-actions" className="flex flex-wrap items-center gap-2.5">{actions}</div>`.
  - Docstring: the `APP_TITLE` constant is the title size of a signed-in surface ("the work, not the headline, owns the first screen").
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(ui): PageIntro actions slot and a compact app title`

### Task 3: Results header as one compact band (N4 card)

**Needs decision 1 confirmed first.**

**Files:**
- Modify `app/(app)/analysis/[id]/results-header.tsx`
- Modify `docs/product/specs.md` (F4)
- Test `tests/app/results-header.test.tsx`

**Interfaces:**
- `ResultsHeader` props unchanged.
- New module constant in the same file: `const BUCKETS = [{ tone: "evidenced", title: "Strong match" }, { tone: "partial", title: "Partial evidence" }, { tone: "absent", title: "Not evidenced" }] as const;` Both the ring card and the disclosure read it, so the titles cannot drift apart.

**Steps:**
- [ ] **Step 1: failing tests.** Fixture:
  ```ts
  import { describe, it } from "vitest";
  import { ResultsHeader } from "@/app/(app)/analysis/[id]/results-header";
  import type { DomainCoverageItem, DomainRequirement } from "@/lib/domain/types";
  const req = (id: string, skillName: string | null, text: string): DomainRequirement =>
    ({ id, kind: "hard_skill", text, necessity: "required", mentionCount: 1, skillName, evidenceQuote: "quoted" });
  const requirements = [req("r1", "Kubernetes", "Kubernetes"), req("r2", "Terraform", "Terraform"), req("r3", "Rust", "Rust"), req("r4", null, "Mentors junior engineers")];
  const coverage: DomainCoverageItem[] = [
    { requirementId: "r1", status: "evidenced", evidenceBulletIds: ["b1"], rationale: "r" },
    { requirementId: "r2", status: "partial", evidenceBulletIds: [], rationale: "r" },
    { requirementId: "r3", status: "absent", evidenceBulletIds: [], rationale: "r" },
  ]; // r4 has no row → absent
  const html = renderToStaticMarkup(createElement(ResultsHeader, {
    analysis: { jdSource: "paste", jdFilename: null, company: "Acme", title: "Staff Platform Engineer", location: "Bengaluru", seniority: "Senior", employmentType: "Full-time", score: 58, scoreVerdict: "Strong on delivery", scoreNote: "Thin on infra", truncated: false, protectedNotice: null, fromSavedJob: false },
    requirements, coverage, bulletTexts: { b1: "Ran 40 clusters" },
  }));
  const iScore = html.indexOf('data-tour="score"'), iCov = html.indexOf('data-tour="coverage"');
  const card = html.slice(iScore, iCov);
  ```
  Tests:
  1. `"title, then the ring card, then the requirement detail"`:
     ```ts
     assert.ok(html.indexOf("<h1") >= 0 && html.indexOf("<h1") < iScore && iScore < iCov)
     ```
  2. `"N4: the ring and all three bucket counts share one card, at every width"`:
     ```ts
     has(card, "58 percent of this posting");
     has(card, ">match<");
     has(card, "№ 4 requirements");
     assert.match(card, /data-bucket="evidenced"[^]*?Strong match[^]*?>1</);
     assert.match(card, /data-bucket="partial"[^]*?Partial evidence[^]*?>1</);
     assert.match(card, /data-bucket="absent"[^]*?Not evidenced[^]*?>2</);
     assert.ok(!/class="[^"]*\b(hidden|more-copy)\b/.test(card), "bucket counts must show on every screen (specs F0)");
     ```
  3. `"requirement tags sit in one disclosure, closed by default, all inside"`:
     ```ts
     const tag = html.match(/<details[^>]*data-tour="coverage"[^>]*>/);
     assert.ok(tag && !/\sopen[\s=>]/.test(tag[0]));
     for (const s of ["Kubernetes", "Terraform", "Rust", "Mentors junior engineers"]) has(html.slice(iCov), s);
     ```
  4. `"no decorative card: each meta value renders once"`:
     ```ts
     assert.equal(html.split("Bengaluru").length - 1, 1);
     assert.equal(html.split("Full-time").length - 1, 1);
     ```
  5. `"the coverage note stays visible, before the disclosure"`:
     ```ts
     const n = html.indexOf("Not a prediction"); assert.ok(n > 0 && n < iCov);
     ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/results-header.test.tsx`. Expected: test 1 passes; test 2 fails (no `data-bucket`); test 3 fails (`tag` is null); test 4 fails (`2 !== 1`); test 5 fails (the note comes after the buckets).
- [ ] **Step 3: implement.**
  - Breadcrumb: `mb-3`.
  - Band: `grid items-start gap-[clamp(1.25rem,3vw,2.5rem)] lg:grid-cols-[minmax(0,1fr)_auto]`.
  - Left column, in this order:
    - eyebrow `mb-2`
    - the G4/G3 notice `mb-2`
    - h1 `mb-2 break-words text-[clamp(1.75rem,3.6vw,3rem)]`
    - meta `mb-3`
    - verdict
    - note
    - the existing `InfoNote` with unchanged copy, `className="mt-3"`
  - Right column, the ring card:
    ```tsx
    <div data-tour="score" className="flex flex-wrap items-center gap-5 rounded-[var(--radius-lg)] bg-[var(--color-bg-raised)] px-5 py-4">
      {/* existing ring <svg>, width/height 112, role/aria-label unchanged */}
      <div className="min-w-[11rem] flex-1">
        <p className="text-base font-semibold">Requirement coverage</p>
        <p className="mb-2.5 text-sm text-[var(--color-text-muted)]">{`№ ${total} requirement${total === 1 ? "" : "s"}`}</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          {BUCKETS.map(({ tone, title }) => (
            <li key={tone} data-bucket={tone} className="flex items-center justify-between gap-4">
              <span>{title}</span>
              <strong className={`tag min-h-7 px-2.5 ${BUCKET_TONE[tone].pill}`}>{buckets[tone].length}</strong>
            </li>))}
        </ul>
      </div>
    </div>
    ```
  - After the band:
    ```tsx
    <details data-tour="coverage" className="group mt-[clamp(1rem,2vw,1.5rem)]">
      <summary className="tag tag-outline min-h-[38px] cursor-pointer list-none px-4 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
        Every requirement, sorted by evidence <ChevronDown className="lucide h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
        {BUCKETS.map(…)} {/* three <Bucket> */}
      </div>
    </details>
    ```
  - Delete:
    - the hanging `№` tag
    - the "Evidenced: X of N" pill
    - the `aria-hidden` marigold card
    - `papers`, `TemplatePaper`, `templateById`
    - the meta `icon` fields and the `Building2`/`Clock3`/`MapPin`/`Star` imports
  - Add the `ChevronDown` import.
  - The `Bucket` component is unchanged.
  - Update the file docstring: buckets beside the ring as counts; tags behind one disclosure.
  - Specs F4 (`docs/product/specs.md`, around line 705):
    - Replace the first paragraph with: "`Analysis complete · {jdSource}` with extracted JdMeta, then one compact band: title, meta, verdict, note and the coverage note on the left; on the right the score ring in one card with the three buckets — Strong match, Partial evidence, Not evidenced — and their counts (N4). Every requirement tag sits in one disclosure under the band, *Every requirement, sorted by evidence*, closed by default."
    - Change the acceptance line to "…traces to a specific bullet in one click once the requirement list is open; …".
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(analysis): compact results header — ring beside its three bucket counts, requirements in a disclosure`

### Task 4: Analysis layout order

**Files:**
- Modify `app/(app)/analysis/[id]/layout.tsx`
- Modify `docs/product/specs.md` (F32 banner)
- Test `tests/app/analysis-layout.test.ts`

**Steps:**
- [ ] **Step 1: failing tests**
  ```ts
  import { it } from "vitest";
  import { sourceOf } from "../structure/files";
  const src = sourceOf("app/(app)/analysis/[id]/layout.tsx");
  it("header, then tabs, then the section, then the promo strip, then Up next", () => {
    const [h, t, s, p, j] = ["<ResultsHeader", "<AnalysisTabs", "{children}</div>", "<PromoMarquee", "<AnalysisJourney"].map((x) => at(src, x));
    assert.ok(h < t && t < s, "tabs must follow the header and precede the section");
    assert.ok(s < p && p < j, "promo strip must follow the section and precede Up next");
  });
  it("no full-width divider between the header and the tabs", () => {
    assert.ok(!src.includes("h-px bg-[var(--color-line)]"));
  });
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/analysis-layout.test.ts`. Expected FAIL: `promo strip must follow the section…` and the divider assertion.
- [ ] **Step 3: implement.** The ready-path JSX, in order:
  - `<ResultsHeader …/>`
  - `{generating ? <BackgroundRefresh /> : null}`
  - `<div className="mt-[clamp(1.25rem,2.5vw,2rem)]"><AnalysisTabs …/></div>`
  - `<div className="mt-[clamp(1.5rem,3vw,2.25rem)]">{children}</div>`
  - `<PromoMarquee className="mt-[clamp(2rem,4vw,3rem)]" />`
  - `<AnalysisJourney …/>`
  - `<AnalysisDock …/>`

  Specs F32 "The banner": "…a marigold strip at the top of the landing page and /analyze, and under the section (above *Up next*) on every analysis page…".
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(analysis): tabs right under the header, promo strip below the section`

### Task 5: Compact tab cards from 641px up (visual only)

**Files:**
- Modify `app/globals.css` (the `.tab-bar` blocks at about lines 519–590)

**No test.** This is a pure CSS density change, checked by looking (§11). The phone strip (≤640px, about line 1565) is untouched.

**Steps:**
- [ ] **Step 1: implement.**
  - Change `@media (min-width: 641px) and (max-width: 860px)` to `@media (min-width: 641px)`. Keep its button, dot, label and count rules verbatim. Set `.tab-bar { grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 10px; }`.
  - Add a new block after it: `@media (min-width: 641px) and (max-width: 860px) { .tab-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`.
  - Rewrite the block comment: "From 641px up the cards are compact rows, not 142px slabs — on a laptop the slabs took two rows and pushed the section below the first screen. Tablet keeps two-up; wider screens fit one row (all seven at 1280)."
  - Sizing check: 7 × 140 + 6 × 10 = 1040px, which fits the 1126px `<main>` content box at 1280.
- [ ] **Step 2:** `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 3:** jiraiya. Commit intent: `feat(analysis): one-row compact tab cards on wide screens`

### Task 6: Résumés tab, shelf first

**Files:**
- Modify `app/(app)/analysis/[id]/resumes/page.tsx`
- Modify `app/(app)/analysis/[id]/resumes/skill-consent.tsx`
- Modify `components/portfolio-promo.tsx` (single use)
- Test `tests/app/resumes-page.test.ts`

**Steps:**
- [ ] **Step 1: failing test**
  ```ts
  const src = sourceOf("app/(app)/analysis/[id]/resumes/page.tsx");
  it("header row, then the shelf, then the skill offer, then the portfolio promo", () => {
    const [d, shelf, sc, pp] = ["<DownloadAll", 'data-tour="shelf"', "<SkillConsent", "<PortfolioPromo"].map((x) => at(src, x));
    assert.ok(d < shelf, "Download all stays in the header row above the shelf");
    assert.ok(shelf < sc && sc < pp, "skill offer and portfolio promo must follow the shelf");
  });
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/resumes-page.test.ts`. Expected FAIL on the second assertion.
- [ ] **Step 3: implement.**
  - Move the `featureEnabled("portfolio")` / `<PortfolioPromo>` expression to after the shelf grid, and the `unlisted.length > 0 ? <SkillConsent …/>` line to sit between the grid and the promo.
  - Replace the "portfolio leads the tab" comment: "below the drafts it grows out of".
  - `SkillConsent` root: `<Card flat className="mb-9">` becomes `className="mt-[clamp(2rem,4vw,3rem)]"`.
  - `PortfolioPromo` root: `promo-glow mb-8` becomes `promo-glow mt-[clamp(2rem,4vw,3rem)]`. Its docstring "beside the drafts" becomes "under the drafts".
  - `DownloadAll` is unchanged; it is already in the header row.
  - Why the skill offer stays next to the shelf: it does not gate rendering; it offers to rebuild the drafts, and the drafts are directly above it.
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(resumes): drafts first; skill offer and portfolio promo below the shelf`

### Task 7: Profile editor, corpus first

**Files:**
- Modify `app/(app)/profile/profile-editor.tsx`
- Modify `app/(app)/profile/usage-panel.tsx` (size only)
- Modify `docs/product/specs.md` (F11)
- Test `tests/app/profile-editor.test.tsx`

**Interfaces:**
- Produces `export function IdentitySection(props: { resume: StoredResume; patch: (fn: (r: StoredResume) => StoredResume) => void; sourceFilename: string | null; updatedAt: string; bulletCount: number; open: boolean; onToggle: () => void })`. It is exported so the open state can be tested.

**Steps:**
- [ ] **Step 1: failing tests**
  ```ts
  import { it, vi } from "vitest";
  vi.mock("@/app/actions/onboarding", () => ({ updateProfile: vi.fn() }));
  import { IdentitySection, ProfileEditor } from "@/app/(app)/profile/profile-editor";
  import type { StoredResume } from "@/lib/ai/schemas/resume-json";
  const resume: StoredResume = {
    basics: { name: "Asha Rao", label: "Platform Engineer", email: "asha@example.com", phone: "", url: "", summary: "Builds platforms.", location: { city: "Pune", region: "MH", countryCode: "IN" }, profiles: [] },
    work: [{ name: "Acme", position: "Engineer", location: "", startDate: "2021-01", endDate: null, summary: "", highlights: ["Cut deploy time 40%"] }],
    education: [], skills: [{ name: "Go", level: "Deep", keywords: [] }], projects: [], certificates: [], volunteer: [], awards: [], languages: [],
  };
  const html = renderToStaticMarkup(createElement(ProfileEditor, {
    initial: resume, evidenceByPath: {}, suggestions: [], bulletCount: 1, sourceFilename: null,
    updatedAt: "2026-11-01T00:00:00.000Z", tokenPanel: createElement("div", { id: "usage-probe" }),
  }));
  ```
  Tests:
  1. `"main column: Identity, Summary, Experience, then Skills, then projects"`:
     ```ts
     const idx = [">Identity &amp; contact<", ">Summary<", ">Experience<", ">Skills<", ">Personal projects<"].map((s) => at(html, s));
     assert.deepEqual([...idx].sort((a, b) => a - b), idx);
     ```
  2. `"aside: strength, checks, Save, then the usage meter"`:
     ```ts
     const [aside, ring, checks, save, meter] = ["<aside", "profile strength", "helping, what", "Save profile", 'id="usage-probe"'].map((s) => at(html, s));
     assert.ok(aside < ring && ring < checks && checks < save && save < meter);
     ```
  3. `"Identity opens collapsed to one line"`:
     ```ts
     has(html, "Asha Rao · Platform Engineer · Pune · asha@example.com");
     has(html, "Edit details");
     const fields = html.match(/<div[^>]*id="identity-fields"[^>]*>/);
     assert.ok(fields && /\shidden(=""|[\s>])/.test(fields[0]));
     ```
  4. `"Identity open shows the fields"`:
     ```ts
     const open = renderToStaticMarkup(createElement(IdentitySection, { resume, patch: () => {}, sourceFilename: null, updatedAt: "2026-11-01T00:00:00.000Z", bulletCount: 1, open: true, onToggle: () => {} }));
     has(open, 'aria-expanded="true"');
     has(open, "Full name");
     has(open, "Hide details");
     lacks(open, "asha@example.com</p>");
     assert.ok(!/id="identity-fields"[^>]*\shidden/.test(open));
     ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/profile-editor.test.tsx`. Expected FAIL:
  - Test 1: Skills comes before Experience.
  - Test 2: the meter comes before `<aside`.
  - Tests 3 and 4: no summary line, and `IdentitySection` is not exported (`createElement` gets `undefined`).
- [ ] **Step 3: implement.**
  - Remove `{tokenPanel}` from the top of the main column.
  - Move the whole Skills `<Section>` block verbatim to after the Experience `<Section>`.
  - In the aside, the order is: strength card, checks, Save row, `{tokenPanel}`.
  - Add `const [identityOpen, setIdentityOpen] = useState(false)` and pass `open` and `onToggle`.
  - `IdentitySection` changes:
    - Wrap the existing "Replace résumé" link and a new button in `<div className="ml-auto flex flex-wrap gap-2">`. Drop `ml-auto` from the link.
    - The new button: `<button type="button" aria-expanded={open} aria-controls="identity-fields" onClick={onToggle} className="btn btn-secondary btn-sm">{open ? "Hide details" : "Edit details"}<ChevronDown …rotate when open/></button>`. Keep the `<h3>` outside the button: a heading inside a `<button>` is invalid HTML.
    - When closed, render `<p data-identity-summary className="text-sm">{[name, label, location.city, email].filter(Boolean).join(" · ")}</p>`.
    - The field grid becomes `<div id="identity-fields" hidden={!open} className="grid …">`.
  - Update the `tokenPanel` prop doc: "slotted into the aside".
  - `usage-panel.tsx` h3 size `text-[clamp(2.1rem,3.8vw,3.1rem)]` becomes `text-[clamp(1.75rem,2.4vw,2.25rem)]`. It now sits in a 330px rail; this is visual only.
  - Specs F11 first two paragraphs:
    - Column order: identity (one line until opened), summary, experience, skills, projects, then education/certs/languages/preferences.
    - Aside: strength, checks, Save, then the usage meter.
    - Rewrite "The meter leads the column…" to: "The meter sits in the aside: it is the one thing on this page that is not the corpus" (keep the server-component sentence).
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(profile): corpus first — experience before skills, identity collapsed, meter in the aside`

### Task 8: Profile page header actions and Account block

**Files:**
- Modify `app/(app)/profile/page.tsx`
- Modify `app/(app)/profile/profile-editor.tsx`
- Modify `docs/product/specs.md` (F11)
- Test `tests/app/profile-page.test.ts`, plus an extension to `tests/app/profile-editor.test.tsx`

**Interfaces:**
- Consumes `PageIntro` `actions` and `compact` (Task 2).
- **Part B contract:** the Enhance button goes inside this `actions` fragment, before Replace résumé. The slot renders as `data-slot="page-actions"`, a wrapping row with `gap-2.5`.

**Steps:**
- [ ] **Step 1: failing tests**
  - `profile-page.test.ts`:
    ```ts
    const src = sourceOf("app/(app)/profile/page.tsx");
    it("the header carries the actions slot with Replace résumé", () => {
      const intro = src.slice(at(src, "<PageIntro"), at(src, "</PageIntro>"));
      for (const s of ["compact", "actions={", 'href="/onboarding"', "Replace résumé"]) has(intro, s);
    });
    it("account controls sit together in one block after the editor", () => {
      const block = at(src, 'id="account-heading"');
      assert.ok(at(src, "<ProfileEditor") < block);
      assert.ok(src.lastIndexOf("{accountName}") > block);
      assert.ok(block < at(src, "<NotificationsPanel") && at(src, "<NotificationsPanel") < at(src, "<DeleteAccount"));
    });
    it("without a profile, the import prompt comes before the name form", () => {
      assert.ok(at(src, 'title="No profile yet"') < at(src, "{accountName}"));
    });
    ```
  - Append to `profile-editor.test.tsx`: `it("Replace résumé lives in the page header, not the editor", () => lacks(html, "Replace résumé"));`
- [ ] **Step 2:** run `pnpm vitest run tests/app/profile-page.test.ts tests/app/profile-editor.test.tsx`. Expected: all four new assertions FAIL.
- [ ] **Step 3: implement.**
  - Page:
    - `<PageIntro compact kicker="Your profile" title="The corpus we draw on" actions={<Link href="/onboarding" className="btn btn-secondary btn-sm no-underline">Replace résumé</Link>}>` with the standfirst unchanged.
    - Remove the `{accountName}` line under the intro and the two `mt-8 max-w-3xl` wrappers.
    - After `<ProfileEditor>`: `<section aria-labelledby="account-heading" className="mt-[clamp(2.5rem,5vw,4rem)] max-w-3xl"><h2 id="account-heading" className="mb-5">Account</h2><div className="space-y-6">{accountName}<NotificationsPanel …/><DeleteAccount /></div></section>`.
    - No-profile branch order: `EmptyState`, the import button, then `{accountName}`.
  - Editor: delete the Replace résumé `<Link>` from `IdentitySection`. The wrapper div keeps only the toggle.
  - Specs F11: add "Header actions on the right (Replace résumé). One **Account** block at the foot: name, notifications, delete everything."
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(profile): header actions slot and one Account block`

### Task 9: /analyze, posting box first

**Files:**
- Modify `app/(app)/analyze/page.tsx`
- Modify `app/(app)/analyze/queued-runs.tsx` (margin only)
- Test `tests/app/analyze-page.test.ts`

**Steps:**
- [ ] **Step 1: failing test**
  ```ts
  const src = sourceOf("app/(app)/analyze/page.tsx");
  it("the posting box is first; parked runs lead the aside", () => {
    const [jd, aside, q, card] = ["<JdInput", "<aside", "<QueuedRuns", "<Card flat"].map((s) => at(src, s));
    assert.ok(jd < aside && aside < q && q < card, "QueuedRuns must sit at the top of the aside, after JdInput");
  });
  it("the hero uses the app title size", () => has(src, "${APP_TITLE}"));
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/analyze-page.test.ts`. Expected: both FAIL.
- [ ] **Step 3: implement.**
  - Move `<QueuedRuns runs={…} />` to be the first child of `<aside>`.
  - Hero: wrapper `mb-[clamp(1.25rem,2.5vw,2rem)]`, eyebrow `mb-2`, h1 `` className={`mb-3 leading-[0.92] ${APP_TITLE}`} ``. The two-line copy and `{drafts}` stay as they are (§5).
  - Import `APP_TITLE`.
  - `queued-runs.tsx` root: `rise-in mb-7 …` becomes `rise-in …`, because the aside's gap spaces it.
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(analyze): posting box first, parked runs in the aside`

### Task 10: /jobs, saved jobs in a rail

**Files:**
- Modify `app/(app)/jobs/page.tsx`
- Modify `app/(app)/jobs/saved-jobs-panel.tsx` (copy)
- Test `tests/app/jobs-page.test.tsx`

**Steps:**
- [ ] **Step 1: failing tests**
  ```ts
  import { it, vi } from "vitest";
  vi.mock("@/app/actions/jobs", () => ({ setSavedJobStatus: vi.fn(), unsaveJob: vi.fn(), setSavedJobNote: vi.fn() }));
  import { SavedJobsPanel } from "@/app/(app)/jobs/saved-jobs-panel";
  const src = sourceOf("app/(app)/jobs/page.tsx");
  it("search is the main column; saved jobs are the rail", () => {
    has(src, 'railLabel="Saved jobs"');
    has(src, "rail={<SavedJobsPanel jobs={saved} />}");
    assert.equal(src.split("<SavedJobsPanel").length - 1, 1);
    assert.ok(at(src, "<WithRail") < at(src, "<JobSearchClient"));
  });
  it("a compact intro with the shorter standfirst", () => {
    has(src, "<PageIntro compact");
    has(src, "Listings are sorted by facts you can check, never by a score.");
    lacks(src, "your skills it names, the ones it asks for");
  });
  it("the empty tracker no longer points 'above'", () => {
    const html = renderToStaticMarkup(createElement(SavedJobsPanel, { jobs: [] }));
    has(html, "Save a listing to track it here.");
    lacks(html, "above");
  });
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/jobs-page.test.tsx`. Expected: all three FAIL.
- [ ] **Step 3: implement.**
  - Standfirst (keeps the N19 and N20 claims):
    ```tsx
    <PageIntro compact kicker="Job search" title="Listings sorted against your own profile">Titles, skills and a city — nothing else about your profile leaves this server. Listings are sorted by facts you can check, never by a score.</PageIntro>
    ```
  - Wrap the `CapNotice` / `JobSearchClient` ternary in `<WithRail railLabel="Saved jobs" rail={<SavedJobsPanel jobs={saved} />}>…</WithRail>`.
  - Remove the old trailing `<SavedJobsPanel>`.
  - Panel empty copy: "Nothing saved yet. Save a listing to track it here."
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(jobs): saved jobs in a side rail, shorter standfirst`

### Task 11: /history, rounds in a rail

**Files:**
- Modify `app/(app)/history/page.tsx`
- Modify `components/upcoming-rounds.tsx` (margin and comment)
- Modify `docs/product/specs.md` (F29.1)
- Test `tests/app/history-page.test.ts`

**Steps:**
- [ ] **Step 1: failing test**
  ```ts
  const src = sourceOf("app/(app)/history/page.tsx");
  it("the list is the main column; upcoming rounds are the rail", () => {
    has(src, 'railLabel="Upcoming rounds"');
    has(src, "rail={<UpcomingRounds clerkUserId={userId} />}");
    assert.equal(src.split("<UpcomingRounds").length - 1, 1);
    const w = at(src, "<WithRail"), end = at(src, "</WithRail>");
    assert.ok(w < at(src, "<table") && at(src, "<table") < end);
  });
  it("title uses the app title size", () => has(src, "className={APP_TITLE}"));
  ```
- [ ] **Step 2:** run `pnpm vitest run tests/app/history-page.test.ts`. Expected: both FAIL.
- [ ] **Step 3: implement.**
  - Title row: `mb-[clamp(1.25rem,2.5vw,2rem)]`, `<h1 className={APP_TITLE}>History</h1>`.
  - Wrap the phone `<ul>`, the table `<Card>` and the footnote `<p>` in `<WithRail railLabel="Upcoming rounds" rail={<UpcomingRounds clerkUserId={userId} />}>`.
  - `UpcomingRounds`: drop `mb-[clamp(1.5rem,3vw,2.25rem)]` from its `Card`. Docstring: "noise in the rail" instead of "above the table".
  - Specs F29.1: "an **Upcoming rounds** card beside the History list on wide screens (below it on phones)".
- [ ] **Step 4:** PASS. Then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** jiraiya. Commit intent: `feat(history): upcoming rounds in a side rail`

### Task 12: Portfolio studio intro (visual only)

**Files:**
- Modify `app/(app)/analysis/[id]/portfolio/portfolio-studio.tsx`

**No test.** These are inline style values only; check by looking.

**Finding:** the studio already leads with its editor ("1 Pick a look"), and the live preview is sticky beside steps 2–4. What pushes it down is the analysis header (Tasks 3–5) and a large intro. The step order stays as it is.

**Steps:**
- [ ] **Step 1: implement.**
  - Remove `marginTop: "clamp(36px,4cqi,56px)"` from the root `<section>`; the layout's children wrapper already spaces it.
  - Intro wrapper `marginBottom` becomes `"clamp(18px,2.2cqi,28px)"`.
  - h2 `fontSize` becomes `"clamp(28px,3.4cqi,44px)"`.
- [ ] **Step 2:** `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 3:** jiraiya. Commit intent: `feat(portfolio): tighter studio intro`

### Task 13: Look at it (manual)

- [ ] **Step 1: get a preview build.** The app cannot run locally: there is no `.env`, and Clerk plus Supabase are required. The user must OK jiraiya pushing the branch for a Vercel preview, which has its own Supabase (§6).
- [ ] **Step 2:** in Chrome devtools at **1280×800** and **390×844**, signed in as a member with a ready analysis, a parked run, saved jobs and an upcoming round, confirm:
  - **Analysis → Résumés:** the ring card shows three counts; the first row of draft thumbnails starts above the fold at 1280; tabs are one row; the desktop rail appears only after the tabs scroll off; on a phone the dock is intact and the ring card fits without horizontal scroll; the disclosure opens and a Strong-match tag shows its bullet; the promo strip sits above Up next (only visible with a live banner code).
  - **Product tour:** the "coverage" step spotlights the closed disclosure.
  - **Profile:** header shows Replace résumé on the right; Identity is one line; Summary and Experience start in the first screen at 1280; the aside order is ring, checks, Save, meter; the Account block is at the foot; on a phone the aside comes after the corpus.
  - **/analyze:** the posting box is directly under the hero; parked runs top the aside.
  - **/jobs and /history:** rails at ≥1024px, below on phones; no empty 340px column when there are no rounds.
  - **Portfolio:** the look picker begins higher.
- [ ] **Step 3:** record findings. Fixes go back to kakashi as a numbered follow-up.

---

## Review focus for neji

1. **N4 at every width.** The ring card's bucket `<ul>` must not inherit `.more-copy`, `hidden` or `sm:`-gated classes, and the ring must not render anywhere else without it. The test checks the card slice. Also check by eye that nothing in `globals.css` (for example a phone rule on `.tag`) hides the count chips at ≤640px.
2. **`empty:hidden` on the rail.** It only works if the server HTML for `UpcomingRounds` returning `null` is a truly empty `<aside>`. A Suspense or template marker, or whitespace, would leave a 340px blank column on /history. Verify in the preview's page source.
3. **`hidden` vs `.grid` on `#identity-fields`.** Tailwind v4 preflight's `[hidden]` rule (`display:none !important`) must beat `grid`. Confirm the fields are actually invisible when collapsed, and that autosave still fires on edits after opening.
4. **The Skills block moved verbatim.** Check that `skillsOpen`, suggestion buttons and the add-skill form behave the same, with no lost closing tag and no duplicate keys. Check that `IdentitySection`'s new toggle doesn't put a heading inside a `<button>`.
5. **SectionRail and product tour after the header shrink.** The rail's IntersectionObserver still shows the rail only once `[data-tour="tabs"]` has left the top. The tour's `coverage` anchor (now `<details>`) has a non-zero box, so the spotlight isn't empty.
