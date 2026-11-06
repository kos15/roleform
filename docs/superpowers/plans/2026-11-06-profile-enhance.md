<!-- Decision 2026-11-06 (main session): the agent keeps timeoutMs 45_000; app/(app)/profile/page.tsx maxDuration goes 60 → 120 so a 45 s call plus one corrective retry fits. -->

# Profile enhance (F34) plan

**Goal.** A member presses **Enhance profile** at the top of /profile and a review sheet opens. Step 1 asks fixed questions generated from gaps in the profile; answers go in exactly as typed. Step 2 shows each suggested change as before → after. Only tidy is ticked by default; rephrase and remove start unticked. Step 3 applies the ticked changes to the editor without saving them, and the member presses the existing Save. The limit is 2 every 24 hours on every plan; admins have no limit. Enhance runs never count towards the fair-use meter, and suggestions are never stored.

**Architecture.** The logic is pure functions in `lib/domain/enhance.ts`:
- the allowance (counting `ai_runs` rows in the last 24 h)
- which fields go to the model
- the deterministic filter (`checkFabrication` plus a check that every number is kept)
- the questions
- `applyProposals`

The server side is one `writer-fast` agent (`enhance_profile`), one server action `enhanceProfile()` in `app/actions/profile.ts`, and `checkEnhanceAllowance` in `lib/services/auth.ts`. The UI is a Radix dialog owned by `ProfileEditor`, so applying patches editor state directly. The header button opens it by firing a window event.

**Global constraints (CLAUDE.md).**
- **§3 / N3:** the model may only rephrase, tidy or remove, and never writes to the profile. The member ticks every change and saves through `updateProfile` → `saveProfileEdit`.
- **N6:** the model's output goes through `generateObject` with a schema built from the input (path enum, `.max(40)`, no URL field).
- **N7:** the prompt never contains `basics` name, email, phone, location, profiles or url. Logs carry counts only. `AppError.detail` carries only an ISO time.
- **N22 (as amended):** this is not a `QuotaKey`. The constant lives in `lib/domain/`, rows are counted at the action, the limit is stated on the sheet, and admins are uncapped through `withinCap` / `effectiveCap`.
- **N9:** Lucide via the `.lucide` class (stroke 2.25), `var(--color-scrim)` for the overlay, no hex values.
- **§10:** pure code in `lib/domain/`; the agent, prompt, system prompt, schema and service each in their `lib/ai/*` folder; the action in `app/actions/`; the UI in `app/(app)/profile/`.
- **§11:** test first. Run `pnpm test` and `pnpm -s typecheck` green after every task.
- **§13:** new vocabulary is `ProfileProposal` and `ProfileQuestion`. Use `Result<T, AppError>`.
- **Token-copy test:** no member-facing string may contain the word "token".

**Part A coordination.**
- **If Part A has landed:** mount `<EnhanceButton />` in the Profile header actions slot, gated on `enhance`.
- **If it hasn't:** insert it in `app/(app)/profile/page.tsx` immediately after line 74 (`{accountName}`) and before the `{/* The meter goes INTO the editor's …` comment, wrapped in `<div className="mb-4">`.

The other page edits are an `enhance` value computed after line 47 and one `enhance={enhance}` prop on `<ProfileEditor>` (line 81). Line numbers may need rebasing after Part A.

## PENDING.md lines to add

Add as a new section `## Profile enhance (F34) — docs/superpowers/plans/2026-11-06-profile-enhance.md` above `## Carried over`:

```
- [ ] Task 1: pure allowance — `lib/domain/enhance.ts` constants, `enhanceAllowance`, `enhanceView`
- [ ] Task 2: fields, `numbersPreserved`, `filterProposals`, duplicate-skill proposals; `lib/ai/schemas/profile-enhance.ts`
- [ ] Task 3: `profileQuestions`, `applyProposals` (re-keys bullet ids on remove), `preselected`
- [ ] Task 4: `UNMETERED_PURPOSES` — meter, carry rule and admin per-member usage exclude `enhance_profile`
- [ ] Task 5: ProfileEnhancer agent — system prompt, builder, roster, service
- [ ] Task 6: `readEnhanceAllowance` / `checkEnhanceAllowance`, `LIMITS.enhance`
- [ ] Task 7: `profile_enhance` feature switch (migration + Prisma enum + FEATURES)
- [ ] Task 8: `enhanceProfile()` action in `app/actions/profile.ts`
- [ ] Task 9: review sheet (`app/(app)/profile/enhance-sheet.tsx`)
- [ ] Task 10: wire the sheet into ProfileEditor (autosave hold, Undo) and mount the button on /profile
- [ ] Task 11: docs — F34 spec, §10 agent row, §14, F19 note, N22 amendment (CLAUDE.md + rules.md), §13 vocabulary, quotas tokens description
- [ ] `extract_profile` runs draw on the fair-use meter but `fairUseCeiling` budgets nothing for them — candidate for `UNMETERED_PURPOSES` (needs hokage: cost model)
- [ ] Enhance worst case (45 s timeout × 2 attempts) exceeds /profile `maxDuration = 60` — needs hokage: `timeoutMs: 25_000` or `maxDuration = 120`; measure p95 from `ai_runs.latency_ms`
- [ ] Profile editor: Remove bullet / Move up-down leave `x_roleform.bulletIds` keyed by the old path, so the next save rewrites a cited bullet's text in place (`saveProfileEdit` matches by path) — re-key the way `applyProposals` does
- [ ] Profile editor never learns ids `saveProfileEdit` mints for new paths (`updateProfile` returns only `profileId`), so every autosave mints a fresh row for a new bullet and retires the previous one — return `bulletIds` and merge
- [ ] Eval set for `enhance_profile` (`scripts/evals`): adversarial bullets that tempt a metric/tool/seniority; measure the dropped rate
- [ ] `tokensUsedThisCycle` (lib/db/queries/tokens.ts) has no callers — delete or wire
```

---

### Task 1: Pure allowance

**Files.**
- Create `lib/domain/enhance.ts`
- Test `tests/domain/enhance.test.ts`

**Interfaces.**
- Consumes `withinCap` and `effectiveCap` from `lib/domain/entitlements.ts`, and `Role` from `lib/domain/types.ts`.
- Produces these constants:
  - `ENHANCE_PURPOSE = "enhance_profile" as const`
  - `ENHANCE_PER_DAY = 2`
  - `ENHANCE_ATTEMPTS_PER_DAY = 6`
  - `ENHANCE_WINDOW_MS = 86_400_000`
  - `ENHANCE_LIMIT_COPY = "2 every 24 hours, on every plan"`
- And these types and functions:
  - `interface EnhanceRunRow { createdAt: Date; schemaValid: boolean }`
  - `interface EnhanceAllowance { allowed: boolean; used: number; left: number; nextAt: Date | null; reason: "ok" | "used" | "attempts" }`
  - `type EnhanceBlock = "suspended" | "off"`
  - `interface EnhanceView { left: number | null; nextAt: string | null; reason: EnhanceAllowance["reason"] | EnhanceBlock }`
  - `enhanceAllowance(args: { role: Role; rows: readonly EnhanceRunRow[]; now: Date }): EnhanceAllowance`
  - `enhanceView(a: EnhanceAllowance, blocked: EnhanceBlock | null): EnhanceView`

- [ ] **Step 1: failing tests.** Use `const NOW = new Date("2026-11-06T12:00:00.000Z")`, `const at = (iso: string, schemaValid = true) => ({ createdAt: new Date(iso), schemaValid })`, `const run = (rows, role = "member") => enhanceAllowance({ role, rows, now: NOW })`.
  - "fresh member has two": `expect(run([])).toEqual({ allowed: true, used: 0, left: 2, nextAt: null, reason: "ok" })`
  - "two valid runs close it until the older one is 24h old": `run([at("2026-11-06T10:00:00Z"), at("2026-11-06T08:00:00Z")])` → `{ allowed: false, used: 2, left: 0, nextAt: new Date("2026-11-07T08:00:00Z"), reason: "used" }`. Rows are deliberately unsorted.
  - "a run exactly 24h old is outside the window": `run([at("2026-11-05T12:00:00Z"), at("2026-11-06T10:00:00Z")])` → `allowed: true, used: 1, left: 1`.
  - "six failed attempts close it without spending one": six `at("2026-11-06T0{6..11}:00:00Z", false)` (06:00…11:00) → `{ allowed: false, used: 0, left: 2, nextAt: new Date("2026-11-07T06:00:00Z"), reason: "attempts" }`.
  - "both exhausted → latest reopening wins": valid 08:00 and 09:00 plus invalid 07:00, 10:00, 10:30, 11:00 → `reason: "used"`, `nextAt: new Date("2026-11-07T08:00:00Z")`.
  - "admin is uncapped but measured": five valid plus three invalid rows with `role "admin"` → `{ allowed: true, used: 5, left: Infinity, nextAt: null, reason: "ok" }`.
  - "the copy names the constant": `expect(ENHANCE_LIMIT_COPY).toContain(String(ENHANCE_PER_DAY))`.
  - `enhanceView`:
    - the "used" result maps to `{ left: 0, nextAt: "2026-11-07T08:00:00.000Z", reason: "used" }`
    - the admin result gives `left: null`
    - `enhanceView(fresh, "suspended")` → `{ left: 0, nextAt: null, reason: "suspended" }`
- [ ] **Step 2:** `pnpm vitest run tests/domain/enhance.test.ts` → FAIL `Cannot find module '@/lib/domain/enhance'`.
- [ ] **Step 3: implement in `lib/domain/enhance.ts`.**
  - The window is `now - createdAt < ENHANCE_WINDOW_MS`.
  - `used` counts the `schemaValid` rows; `attempts` counts all rows.
  - `allowed = withinCap(role, PER_DAY, used) && withinCap(role, ATTEMPTS, attempts)`.
  - `left = max(0, effectiveCap(role, PER_DAY) - used)`.
  - Each exhausted constraint reopens at `sortedAsc[count - cap].createdAt + WINDOW`. `nextAt` is the latest of those, or `null` when allowed.
  - Header comment: N22 amended — not a QuotaKey; identical on every plan.
- [ ] **Step 4:** run → PASS; then `pnpm test` and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(enhance): pure 2-per-24h allowance, identical on every plan`

### Task 2: Fields, filter, and the proposal schema

**Files.**
- Modify `lib/domain/fabrication.ts`: export `numbersIn`, and strip trailing `.`/`,` from each normalised token.
- Modify `lib/domain/enhance.ts`
- Create `lib/ai/schemas/profile-enhance.ts`
- Tests:
  - `tests/domain/enhance.test.ts`
  - `tests/domain/fabrication.test.ts` (new)
  - `tests/ai/schemas/profile-enhance.test.ts` (new)

**Interfaces.**
- New constants in `enhance.ts`: `ENHANCE_MAX_FIELDS = 80`, `ENHANCE_MAX_PROPOSALS = 40`, `ENHANCE_REASON_MAX = 140`, `ENHANCE_TEXT_MAX = 1_200`.
- New types and functions in `enhance.ts`:
  - `interface EnhanceField { path: string; text: string }`
  - `interface ProfileProposal { path: string; kind: "rephrase" | "tidy" | "remove"; before: string; after: string | null; reason: string }`
  - `enhanceableFields(resume: StoredResume): EnhanceField[]`
  - `enhanceProfileTerms(resume: StoredResume): string[]` — skill names plus skill keywords.
  - `numbersPreserved(source: string, text: string): boolean`
  - `filterProposals(fields: readonly EnhanceField[], proposals: readonly EnhanceProposalOut[], profileTerms: readonly string[]): { kept: ProfileProposal[]; dropped: number }`
  - `duplicateSkillProposals(resume: StoredResume): ProfileProposal[]`
  - `addsClaim(source: string, after: string, profileTerms: readonly string[]): boolean` — Enhance-only guard called by `filterProposals`: true when `after` adds a capitalised word, number word, ownership/seniority/title word or scale word the source (or profile terms) does not state; whole-word and hyphen-compound comparison; a URL in `after` is also dropped. `checkFabrication` is untouched.
  - `isHighlightPath(path: string): boolean` — `/^(work|projects|volunteer)\.\d+\.highlights\.\d+$/`
- `lib/ai/schemas/profile-enhance.ts` (imports the constants from domain at runtime; domain imports only *types* from here, so there is no runtime cycle):
  - `EnhanceProposalOutSchema` — a static `z.union` with `path: z.string()`. It exists only for the type.
  - `type EnhanceProposalOut = z.infer<typeof EnhanceProposalOutSchema>`
  - `profileEnhanceSchema(fields: readonly EnhanceField[]): z.ZodType<{ proposals: EnhanceProposalOut[] }>`
- Proposal shapes (field order matters):
  - edit: `{ kind: z.enum(["rephrase","tidy"]), path: z.enum(paths), text: z.string().min(1).max(1200), reason: z.string().min(1).max(140) }`
  - remove: `{ kind: z.literal("remove"), path: z.enum(highlightPaths), reason }`
  - Combine with **`z.union`, never `z.discriminatedUnion`** (that emits `oneOf`, which OpenAI strict mode rejects). Omit the remove variant when there are no highlight paths. Wrap as `z.object({ proposals: z.array(...).max(40) })`.

**Field order in `enhanceableFields`:**
1. `basics.summary`
2. For each work entry: `work.i.summary`, then `work.i.highlights.j`
3. For each project: `projects.i.description`, then `projects.i.highlights.j`
4. For each volunteer entry: `volunteer.i.summary`, then `volunteer.i.highlights.j`

Skip empty or whitespace-only text and any text where `findUrls(text).length > 0`. Truncate to 80. Never read anything else from `basics`.

- [ ] **Step 1: failing tests.** Shared fixture `base()` — use it in Tasks 2, 3 and 8:
  - `basics`: name "Asha Example", label "", email "asha@example.com", phone "+91 98765 43210", url "https://asha.dev", summary "", location `{ city: "Pune", region: "MH", countryCode: "IN" }`, profiles `[{ network: "GitHub", username: "asha", url: "https://github.com/asha" }]`
  - `work[0]`: Acme / Frontend Engineer, startDate "2022-01", endDate null, summary "", highlights `["A one","B two","C three","D four"]`
  - `work[1]`: Beta / Developer, "2019-06"–"2021-12", summary "Agency work for retail clients.", highlights `[]`
  - `education`: `[{ institution: "IIT Bombay", area: "CS", studyType: "B.Tech", startDate: null, endDate: null, score: "", courses: [] }]`
  - `skills`: `[{name:"React"},{name:"react "},{name:"TypeScript"}]`, each with `level ""` and `keywords []`
  - `projects`: `[{ name: "Budget app", description: "Shared-flat budgeting, see https://budget.example", url: "", startDate: null, endDate: null, highlights: [] }]`
  - `certificates`: `[{ name: "AWS SA", issuer: "AWS", date: null, url: "" }]`
  - `volunteer`, `awards`, `languages`: `[]`
  - `x_roleform`: `{ schemaVersion: 1, bulletIds: { "work.0.highlights.0":"id-a", ".1":"id-b", ".2":"id-c", ".3":"id-d" }, sensitivity: { hidePhone: false, hideAddress: true } }` — the keys are the full paths `work.0.highlights.N`.

  Tests:
  - "fields are content only, in document order": `enhanceableFields(base()).map(f => f.path)` equals `["work.0.highlights.0","work.0.highlights.1","work.0.highlights.2","work.0.highlights.3","work.1.summary"]`. Also `JSON.stringify(fields)` contains none of `"Asha"`, `"asha@example.com"`, `"98765"`, `"Pune"`, `"github.com"`, `"budget.example"`.
  - "capped at 80": a resume with 100 highlights gives 80 fields.
  - `numbersPreserved`:
    - `("Cut costs by $1.4m across 3 teams", "Across 3 teams, cut costs by $1.4m")` → true
    - `("Grew users 40 %", "Grew users 40%")` → true
    - `("Led 5 engineers", "Led five engineers")` → false
    - `("No numbers here", "Anything")` → true
  - `filterProposals` uses fields `S = {path:"basics.summary", text:"Frontend engineer who builds fast checkout flows."}`, `H0 = {path:"work.0.highlights.0", text:"Cut checkout load time by 40% using React."}`, `H1 = {path:"work.0.highlights.1", text:"helped with  the design system"}`, `H2 = {path:"work.0.highlights.2", text:"Helped with the design system."}` and terms `["React"]`:
    - **keeps:** tidy H1 → "Helped with the design system." gives `kept[0]` equal to `{ path: H1.path, kind: "tidy", before: "helped with  the design system", after: "Helped with the design system.", reason: "r" }`
    - **drops seniority:** rephrase S → "Senior frontend engineer who builds fast checkout flows."
    - **drops a lost number:** rephrase H0 → "Cut checkout load time sharply using React."
    - **drops an added number:** rephrase H2 → "Helped with the design system for 3 teams."
    - **drops a new tool:** rephrase H2 → "Helped with the design system in GraphQL." (terms `["React"]`)
    - **keeps a listed tool:** the same text with terms `["GraphQL"]`
    - **drops a no-op:** text equals source after trim
    - **first proposal per path only:** two proposals for H1 → `kept.length 1`, `dropped 1`
    - **unknown path dropped:** `work.9.highlights.0`
    - **remove on a non-highlight dropped:** remove `basics.summary`
    - **remove of a bullet carrying a number dropped:** remove H0
    - **remove kept:** remove H2 → `{ kind: "remove", before: H2.text, after: null }`
  - `duplicateSkillProposals(base())` equals `[{ path: "skills.1", kind: "remove", before: "react ", after: null, reason: 'Listed twice — same as "React".' }]`
  - `tests/domain/fabrication.test.ts`:
    - `checkFabrication({ source: "Cut time by 40", rewritten: "Cut time by 40.", profileTerms: [] })` equals `[]`
    - `"Cut time by 40"` → `"Cut time by 45"` still gives one `metric` finding
  - `tests/ai/schemas/profile-enhance.test.ts`, with `s = profileEnhanceSchema([{path:"basics.summary",text:"x"},{path:"work.0.highlights.0",text:"y"}])`:
    - accepts rephrase on `basics.summary`; accepts remove on `work.0.highlights.0`
    - rejects remove on `basics.summary`; rejects tidy on `work.9.highlights.0`; rejects `text: ""`
    - rejects a reason of 141 characters, accepts 140
    - rejects 41 proposals
    - `JSON.stringify(z.toJSONSchema(s))` contains `"anyOf"`, does not contain `"oneOf"`, and does not match `/"url"/`
    - `profileEnhanceSchema([{path:"basics.summary",text:"x"}])` rejects any remove
- [ ] **Step 2:** `pnpm vitest run tests/domain/enhance.test.ts tests/domain/fabrication.test.ts tests/ai/schemas/profile-enhance.test.ts` → FAIL: `enhanceableFields is not a function`, `Cannot find module '@/lib/ai/schemas/profile-enhance'`, and the trailing-period finding.
- [ ] **Step 3: implement.**
  - `filterProposals`: walk proposals in order. Mark each path as seen on first sight. The source is the **original** field text.
  - An edit is kept only if all three hold: `after = text.trim()` differs from the trimmed source; `checkFabrication({ source, rewritten: after, profileTerms })` is empty; and `numbersPreserved(source, after)`.
  - A remove is kept only if `isHighlightPath(path)` and `numbersIn(source.toLowerCase()).length === 0`.
  - `numbersPreserved`: every element of `numbersIn(source.toLowerCase())` appears in `numbersIn(text.toLowerCase())`.
  - `duplicateSkillProposals`: compare names with `trim().toLowerCase()`; the first occurrence wins.
- [ ] **Step 4:** run → PASS; then `pnpm test` (the existing tailoring tests must stay green) and `pnpm -s typecheck`.
- [ ] **Step 5:** hand to jiraiya: `feat(enhance): deterministic proposal filter and input-shaped schema`

### Task 3: Questions and apply

**Files.**
- Modify `lib/domain/enhance.ts`
- Test `tests/domain/enhance.test.ts`

**Interfaces.**
- Constants: `ENHANCE_MAX_QUESTIONS = 8`, `ENHANCE_ANSWER_MAX = 1_000`.
- Types:
  - `type QuestionTarget = { kind: "set"; path: string } | { kind: "append"; path: string; owner: string }`
  - `interface ProfileQuestion { id: string; prompt: string; hint: string; input: "text" | "date"; target: QuestionTarget }`
  - `interface AnsweredQuestion { question: ProfileQuestion; answer: string }`
- Functions:
  - `profileQuestions(resume: StoredResume): ProfileQuestion[]`
  - `preselected(proposals: readonly ProfileProposal[]): string[]` — paths whose kind is `tidy` (rephrase and remove start unticked)
  - `applyProposals(resume: StoredResume, accepted: readonly ProfileProposal[], answers: readonly AnsweredQuestion[]): { resume: StoredResume; applied: number; skipped: number }`

**Question order and copy.** Truncate to 8.

| Order | When | id | input | target | prompt | hint |
|---|---|---|---|---|---|---|
| 1 | `basics.summary` is empty | `summary` | text | set `basics.summary` | "In two or three sentences: what do you do, and what are you best at?" | "Goes in as your summary, exactly as you type it." |
| 2 | each role with no highlights | `work.i.first` | text | append `work.i.highlights`, owner `` `${position} · ${name}` `` | `` `What did you achieve as ${position} at ${name}?` `` | "One result, in your words. Added as a bullet under this role." |
| 2 | each role whose highlights have no digit | `work.i.number` | text | append, same owner | `` `What changed because of your work as ${position} at ${name}?` `` | "A number you can stand behind — users, time saved, money, team size. Skip it if you don't have one. Added as a new bullet." |
| 3 | each project with no highlights | `projects.i.first` | text | append `projects.i.highlights`, owner `name` | `` `What did you build in ${name}, and what came of it?` `` | "Added as a bullet under this project." |
| 4 | education `endDate` null | `education.i.endDate` | date | set | `` `When did you finish at ${institution}?` `` | "YYYY or YYYY-MM." |
| 5 | project `startDate` null | `projects.i.startDate` | date | set | `` `When did you start ${name}?` `` | "YYYY or YYYY-MM." |
| 6 | certificate `date` null | `certificates.i.date` | date | set | `` `When was ${name} issued?` `` | "YYYY or YYYY-MM." |

Row 2 runs once per role, in role order, and produces either the `first` or the `number` question for that role.

**Path grammar for apply** (the regexes are load-bearing):
- edit: `/^(basics\.summary|(work|volunteer)\.\d+\.summary|projects\.\d+\.description|(work|projects|volunteer)\.\d+\.highlights\.\d+)$/`
- remove: the highlight paths, or `/^skills\.\d+$/` (compare against `.name`)
- set: `/^(basics\.summary|education\.\d+\.endDate|projects\.\d+\.startDate|certificates\.\d+\.date)$/`

**Algorithm for `applyProposals`:**
1. `structuredClone` the input; never mutate it.
2. Edits: apply only if the current value equals `before`; otherwise count as skipped.
3. Answers: trim each one.
   - An empty answer is ignored and counted as neither applied nor skipped.
   - An answer longer than 1000 characters is skipped.
   - A `date` answer must match `/^\d{4}(-(0[1-9]|1[0-2]))?$/` or it is skipped.
   - `set` applies only if the current value is `""` or `null`.
   - `append` applies only if the parent's owner string is unchanged; it pushes to the end.
4. Removals: validate each against `before` first. Then filter each array by its **original** indices. For highlights, re-key `x_roleform.bulletIds` under that prefix: drop each removed path's id and shift later ids down. Missing `x_roleform` is a no-op.

- [ ] **Step 1: failing tests**, using `base()` from Task 2:
  - `profileQuestions(base()).map(q => q.id)` equals `["summary","work.0.number","work.1.first","projects.0.first","education.0.endDate","projects.0.startDate","certificates.0.date"]`. The `work.1.first` target equals `{ kind: "append", path: "work.1.highlights", owner: "Developer · Beta" }`.
  - Ten roles with no highlights give `length` 8.
  - `preselected([tidy H1, rephrase H0, remove H2])` equals `["work.0.highlights.1"]` — only tidy is pre-ticked.
  - "two removals in one array, ids follow their text": remove `.1` ("B two") and `.3` ("D four") → `work[0].highlights` equals `["A one","C three"]`, bulletIds equal `{ "work.0.highlights.0":"id-a", "work.0.highlights.1":"id-c" }`, `{ applied: 2, skipped: 0 }`.
  - "rephrase and remove together": rephrase `.2` "C three"→"C, three" and remove `.0` "A one" → `["B two","C, three","D four"]`, bulletIds `{ .0:"id-b", .1:"id-c", .2:"id-d" }` (full `work.0.highlights.N` keys).
  - "stale before is skipped": rephrase `.0` with before "A ONE" → `skipped: 1`, highlights unchanged.
  - "duplicate skill removed": remove `skills.1` with before "react " → skill names equal `["React","TypeScript"]`.
  - Answers:
    - summary "  Frontend engineer.  " → `basics.summary` is "Frontend engineer."
    - `work.1.first` "Shipped the loyalty app." → `work[1].highlights` equals `["Shipped the loyalty app."]`
    - the same question with owner "Developer · Gamma" → skipped
    - "   " → applied and skipped both unchanged
    - `education.0.endDate` "2019-13" → skipped; "2019-06" → applied
    - 1001 characters → skipped
  - "input is not mutated": `const r = base(); const c = structuredClone(r); applyProposals(r, all, answers); expect(r).toEqual(c)`.
- [ ] **Step 2:** `pnpm vitest run tests/domain/enhance.test.ts` → FAIL `profileQuestions is not a function`.
- [ ] **Step 3:** implement as specified above.
- [ ] **Step 4:** run → PASS; `pnpm test`, `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(enhance): deterministic questions and path-safe apply`

### Task 4: Keep enhance runs off the meter

**Files.**
- Modify `lib/domain/tokens.ts`, `lib/db/queries/tokens.ts` (around :81 and :120), `lib/admin/members.ts:387`
- Tests: `tests/domain/tokens.test.ts` (new), `tests/db/queries/tokens.test.ts` (new)

**Interfaces.** Both new exports go in `lib/domain/tokens.ts`:
- `UNMETERED_PURPOSES = ["enhance_profile"] as const`
- `meteredRunsWhere(clerkUserId: string, since: Date) → { clerkUserId, createdAt: { gte: since }, purpose: { notIn: [...UNMETERED_PURPOSES] } }`

- [ ] **Step 1: failing tests.**
  - `expect(UNMETERED_PURPOSES).toEqual(["enhance_profile"])` and `toContain(ENHANCE_PURPOSE)`.
  - `meteredRunsWhere("u1", d)` equals `{ clerkUserId: "u1", createdAt: { gte: d }, purpose: { notIn: ["enhance_profile"] } }`.
  - DB test: mock with `vi.hoisted` `{ aiRun: { aggregate: vi.fn() }, $queryRaw: vi.fn() }` and `vi.mock("@/lib/db", () => ({ db }))`.
    - `tokensUsedThisCycle("u1", null)` → `aggregate.mock.calls[0][0].where.purpose` equals `{ notIn: ["enhance_profile"] }`.
    - `$queryRaw.mockResolvedValue([{ bucket: 0, used: 10n }, { bucket: -1, used: 5n }])`; `usageByCycle("u1", new Date("2026-11-01T00:00:00Z"))` equals `{ current: 10, past: [5] }`; `const [strings, ...values] = $queryRaw.mock.calls[0]`; `strings.join("?")` contains `ai."purpose" <> all(?::text[])`; `values` contains `["enhance_profile"]`.
    - "they agree": the aggregate's `notIn` deep-equals that SQL array value.
    - Source pin: `readFileSync("lib/admin/members.ts")` matches `/aiRun\.aggregate\(\{\s*where: meteredRunsWhere\(clerkUserId, since\)/`, and the `workspaceStats` body still has `where: { createdAt: { gte: since } }`.
- [ ] **Step 2:** `pnpm vitest run tests/domain/tokens.test.ts tests/db/queries/tokens.test.ts` → FAIL `UNMETERED_PURPOSES` undefined.
- [ ] **Step 3: implement.**
  - `tokensUsedThisCycle` uses `where: meteredRunsWhere(clerkUserId, cycleStart(quotaResetsAt))`.
  - `usageByCycle` adds `and ai."purpose" <> all(${[...UNMETERED_PURPOSES]}::text[])` after the `clerk_user_id` line.
  - `usageFor` uses `meteredRunsWhere`.
  - `workspaceStats` is untouched, with a one-line comment: the workspace total counts all spend.
- [ ] **Step 4:** run → PASS; `pnpm test` (including `tests/domain/quotas.test.ts`) and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(tokens): enhance_profile runs never draw on the meter`

### Task 5: ProfileEnhancer agent

**Files.**
- Create:
  - `lib/ai/system-prompts/enhance-profile.ts`
  - `lib/ai/prompts/profile-enhancer.ts`
  - `lib/ai/agents/profile-enhancer.ts`
  - `lib/ai/services/enhance-profile.ts`
- Modify `lib/ai/system-prompts/index.ts`, `versions.ts`, and `lib/ai/agents/roster.ts`
- Tests:
  - modify `tests/ai/agents.test.ts`, `tests/ai/prompts.test.ts`, `tests/ai/prompts.fixtures.ts`, `tests/ai/system-prompts.test.ts`
  - create `tests/ai/services/enhance-profile.test.ts`

**Interfaces.**
- `export interface ProfileEnhancerInput { fields: EnhanceField[] }`
- `export const profileEnhancer = defineAgent({ name: ENHANCE_PURPOSE, promptVersion: PROMPT_VERSIONS.enhanceProfile, model: "writer-fast", schema: (i: ProfileEnhancerInput) => profileEnhanceSchema(i.fields), system: SYSTEM.enhanceProfile, dynamicContext: prompt.dynamicContext, reasoningEffort: "low", maxOutputTokens: 6_000, timeoutMs: 45_000, retries: 1, inputGuards: ["pii", "injection_regex"], outputGuards: ["no_urls", "tone"] })`
  - No `staticContext`, no `verify`, no `checker`.
- `PROMPT_VERSIONS.enhanceProfile = "enhance-profile@1"`
- Builder: `dynamicContext(i) = "Profile entries:\n" + i.fields.map(f => `<field path="${f.path}">${f.text}</field>`).join("\n")`
- Service: `enhanceProfile(args: { clerkUserId: string; fields: EnhanceField[] }): Promise<Result<{ proposals: EnhanceProposalOut[] }>>`. It calls `runAgent(profileEnhancer, { fields }, { clerkUserId })` and returns `ok({ proposals: r.value.value.proposals })`.
- System prompt, exact text (template literal using shared `LAW` / `STYLE`):

```
Improve the wording of a member's own profile entries without changing a single fact. ${LAW}
- Each <field> is one entry the member wrote. Propose a change only where it clearly helps; leaving a field alone is the default.
- kind "tidy": fix spelling, grammar, punctuation, capitalisation and spacing only.
- kind "rephrase": the same claim in clearer words — lead with the action, then the result.
- kind "remove": only for a bullet that repeats another bullet or says nothing about the work. Never remove a bullet that carries a number.
- Keep every number exactly as written. Add no number, tool, employer, title, seniority, team size or scale word the field does not already state.
- path: copy the field's path exactly. At most one proposal per path.
- text: the full replacement, ≤ 60 words for a bullet, ≤ 90 for a summary.
- reason: ≤ 20 words on what the change fixes. Never praise or grade the member.
${STYLE}
Before answering, check that every proposal keeps every number in its field and adds nothing the field does not say.
```

- [ ] **Step 1: failing tests.**
  - `agents.test.ts`:
    - rename the roster test to "thirteen" and add `"enhance_profile"` to the sorted list
    - `profileEnhancer` has `model "writer-fast"`, `reasoningEffort "low"`, `retries 1`, `maxOutputTokens 6000`, `timeoutMs 45000`; `inputGuards` deep-equals `["pii","injection_regex"]` and `outputGuards` deep-equals `["no_urls","tone"]`; `checker` is `undefined`
    - `(UNMETERED_PURPOSES as readonly string[]).includes(profileEnhancer.name)`
    - the schema factory rejects path `work.9.highlights.0`
    - `assemblePrompt(profileEnhancer, F.profile_enhancer)` equals `PROMPT_SEPARATOR + 'Profile entries:\n<field path="basics.summary">Frontend engineer who builds fast checkout flows.</field>\n<field path="work.0.highlights.0">Cut checkout load time by 40% using React.</field>'`
  - Fixture `profile_enhancer: { fields: [those two] }`. Add it to `assembled` and `PINNED` in `prompts.test.ts`. The hash comes from the first failing run — check the text equality above first, then paste the received hash.
  - `system-prompts.test.ts`: add `enhanceProfile: "<hash>"` the same way, and `enhanceProfile: "enhance-profile@1"` to the versions test.
  - Service test: mock `@/lib/ai/agents/define` so `runAgent` returns `ok({ value: { proposals: [P] }, aiRunId: "r1", retryCount: 0, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 })`. Assert the result is `ok({ proposals: [P] })` and the third argument is `{ clerkUserId: "u1" }` (no `analysisId`). An error result passes through unchanged.
- [ ] **Step 2:** `pnpm vitest run tests/ai` → FAIL: roster mismatch and missing modules.
- [ ] **Step 3:** implement as listed. Register in `SYSTEM` (index.ts) and in `AGENTS` (roster.ts).
- [ ] **Step 4:** run → PASS; `pnpm test` (the layout test requires context builders to be imported from `lib/ai/prompts`) and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(ai): ProfileEnhancer agent — rephrase, tidy or remove, one fast call`

### Task 6: Allowance seam in auth

**Files.**
- Modify `lib/services/auth.ts`
- Test `tests/services/auth.test.ts` (new)

**Interfaces.**
- `readEnhanceAllowance(clerkUserId: string, now: Date = new Date()): Promise<{ allowance: EnhanceAllowance; blocked: EnhanceBlock | null } | null>`
  - Reads `db.user.findUnique({ where: { clerkUserId }, select: { role: true, suspended: true, capTokens: true } })`.
  - Reads `db.aiRun.findMany({ where: { clerkUserId, purpose: ENHANCE_PURPOSE, createdAt: { gte: new Date(now.getTime() - ENHANCE_WINDOW_MS) } }, select: { createdAt: true, schemaValid: true } })`.
  - `blocked = suspended ? "suspended" : (!isUncapped(role) && capTokens === 0) ? "off" : null`. Decision: admins skip the `capTokens` check, as in `checkTokenAllowance`.
  - Never calls `settlePlan`.
- `checkEnhanceAllowance(clerkUserId: string, now: Date = new Date()): Promise<Result<EnhanceAllowance>>`:
  - no user → `not_found` "We couldn't find your account."
  - suspended → `quota_exhausted`, "Generation is suspended on your account${await askWhom()}. Your profile stays editable."
  - off → `quota_exhausted`, "Generation is switched off on your account${await askWhom()}."
  - reason `"used"` → `appError("quota_exhausted", `You've used both profile enhances for now — ${ENHANCE_LIMIT_COPY}.`, nextAt.toISOString())`
  - reason `"attempts"` → `appError("quota_exhausted", `Too many enhance attempts in the last 24 hours — ${ENHANCE_LIMIT_COPY}.`, nextAt.toISOString())`
  - No `CapWall`.

- [ ] **Step 1: failing tests.**
  - Mock `@/lib/db` (`user.findUnique`, `aiRun.findMany`), `@/lib/admin/members` (`listAdmins: async () => []`), `@clerk/nextjs/server` (`auth`, `currentUser`), `@/lib/db/queries/plan` (`settlePlan` as `vi.fn`), and `@/lib/services/plans/catalog`. `NOW = 2026-11-06T12:00Z`; rows are two valid runs at 08:00 and 10:00.
  - "identical on every plan": for `plan` of `free`, `pro`, `ultra`, `findUnique` resolves `{ role: "member", suspended: false, capTokens: 500_000, plan }`. The three results are deep-equal, `!ok`, `code "quota_exhausted"`, message contains "2 every 24 hours, on every plan", `detail` is "2026-11-07T08:00:00.000Z".
  - The `findMany` where deep-equals `{ clerkUserId: "user_1", purpose: "enhance_profile", createdAt: { gte: new Date("2026-11-05T12:00:00Z") } }`.
  - `settlePlan` is not called.
  - One row → `ok` with `left 1`.
  - Suspended → message contains "suspended".
  - `capTokens 0` as a member → message contains "switched off".
  - `capTokens 0` as an admin with five rows → `ok`.
  - `readEnhanceAllowance` for a suspended member returns `blocked: "suspended"`.
- [ ] **Step 2:** `pnpm vitest run tests/services/auth.test.ts` → FAIL `checkEnhanceAllowance is not a function`.
- [ ] **Step 3:** implement both functions in `auth.ts` next to the other allowance checks. Add `LIMITS.enhance = { limit: 2, windowSeconds: 60 }` to `lib/services/rate-limit.ts` with a one-line comment: a burst guard; the 24 h count is the real limit.
- [ ] **Step 4:** run → PASS; `pnpm test` (the token-copy test scans `auth.ts`) and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(auth): enhance allowance — 2 per 24h on every plan, counted from ai_runs`

### Task 7: `profile_enhance` feature switch

**Files.**
- Create `prisma/migrations/20261106000000_feature_profile_enhance/migration.sql`
- Modify `prisma/schema.prisma` (the `FeatureKey` enum, after `ai_checkers`, with `/// The Enhance button on the profile (F34).`)
- Modify `lib/domain/features.ts` (type union plus a row appended to `FEATURES`)
- Test `tests/domain/features.test.ts` (new)

**Interfaces.** The `FEATURES` row is `{ key: "profile_enhance", label: "Profile enhance", description: "The Enhance button on the profile. Saved profiles are untouched." }`.

- [ ] **Step 1: failing tests.**
  - Parse the `enum FeatureKey { … }` block in `prisma/schema.prisma`, dropping `///` and `@@` lines. Its sorted values equal `FEATURES.map(f => f.key).sort()`.
  - `FEATURES.find(f => f.key === "profile_enhance")` deep-equals the row above.
  - The migration file, trimmed, equals `-- AlterEnum\nALTER TYPE "feature_key" ADD VALUE 'profile_enhance';`
- [ ] **Step 2:** `pnpm vitest run tests/domain/features.test.ts` → FAIL: the profile_enhance row is undefined.
- [ ] **Step 3:** write the SQL following `20261021010000_feature_ai_checkers`, edit the enum and the domain file, then run `pnpm db:generate`. Don't hand-edit `lib/generated`.
- [ ] **Step 4:** run → PASS; `pnpm test`, `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(features): profile_enhance switch`

### Task 8: `enhanceProfile()` action

**Files.**
- Create `app/actions/profile.ts` (`"use server"`)
- Test `tests/app/profile-action.test.ts`

**Interfaces.**
- `export interface EnhanceResult { proposals: ProfileProposal[]; questions: ProfileQuestion[]; dropped: number; status: EnhanceView }`
- `export async function enhanceProfile(): Promise<Result<EnhanceResult>>`

**Order (exact):**
1. `requireFeature("profile_enhance")`
2. `requireUser()`
3. `rateLimit(`enhance:${uid}`, LIMITS.enhance.limit, LIMITS.enhance.windowSeconds)` → on refusal, `invalid_input` "That's a lot at once. Try again in ${n}s."
4. `checkEnhanceAllowance(uid)` → return the refusal as-is
5. `getProfile(uid)` → `not_found` "Import your résumé first."; then `StoredResumeSchema.safeParse` → `invalid_input` "Your profile needs a save before it can be enhanced."
6. Compute `questions = profileQuestions(r)`, `dupes = duplicateSkillProposals(r)`, `fields = enhanceableFields(r)`. If `fields.length === 0`, skip the model call.
7. Otherwise call the service (import it as `enhanceProfileAi`); a model error is returned as-is.
8. `filterProposals(fields, out.proposals, enhanceProfileTerms(r))`
9. `readEnhanceAllowance(uid)` → `enhanceView`
10. `console.info(`[enhance] fields=${n} kept=${k} dropped=${d} questions=${q}`)`
11. Return `ok({ proposals: [...kept, ...dupes], questions, dropped, status })`

Never call `checkTokenAllowance` and never call `revalidatePath`. No DB write.

- [ ] **Step 1: failing tests.**
  - Mock `@/lib/services/features` (`requireFeature`), `@/lib/services/auth` (`requireUser`, `checkEnhanceAllowance`, `readEnhanceAllowance`, `checkTokenAllowance`), `@/lib/db/queries/profile` (`getProfile`), and `@/lib/ai/services/enhance-profile` (`enhanceProfile`). Use a distinct user id per test, because the rate-limit buckets are module-global.
  - Profile `resumeJson` is `base()` but with `work[0].highlights = ["Cut checkout load time by 40% using React.", "helped with  the design system"]` and only `work[0]` (no projects, education or certificates).
  - The service returns `[{kind:"rephrase", path:"work.0.highlights.0", text:"Cut checkout load time sharply with React.", reason:"Stronger verb."}, {kind:"tidy", path:"work.0.highlights.1", text:"Helped with the design system.", reason:"Capitalisation and spacing."}]`.
  - `readEnhanceAllowance` resolves `{ allowance: { allowed: true, used: 1, left: 1, nextAt: null, reason: "ok" }, blocked: null }`.
  - **Happy path:** `result.value` deep-equals:
    - `proposals`: `[{ path: "work.0.highlights.1", kind: "tidy", before: "helped with  the design system", after: "Helped with the design system.", reason: "Capitalisation and spacing." }, { path: "skills.1", kind: "remove", before: "react ", after: null, reason: 'Listed twice — same as "React".' }]`
    - `questions`: ids `["summary"]`
    - `dropped`: 1
    - `status`: `{ left: 1, nextAt: null, reason: "ok" }`
    - The service was called with `{ clerkUserId, fields }`, whose paths are `["work.0.highlights.0","work.0.highlights.1"]`.
  - **N7:** spy on `console.info`; no argument contains "checkout" or "Asha".
  - **Feature off:** `requireFeature` returns `err(feature_off)` → returned; neither `requireUser` nor the service is called.
  - **Allowance refusal:** returned unchanged; the service is not called.
  - `checkTokenAllowance` is never called.
  - **No fields** (all highlights empty, summaries empty) → the service is not called and the result is `ok` with questions.
  - **Burst limit:** three calls for the same user → the third is `invalid_input` and `checkEnhanceAllowance` was called twice.
  - `LIMITS.enhance` deep-equals `{ limit: 2, windowSeconds: 60 }`.
- [ ] **Step 2:** `pnpm vitest run tests/app/profile-action.test.ts` → FAIL `Cannot find module '@/app/actions/profile'`.
- [ ] **Step 3:** implement in the order above. Header comment: F34, N22 as amended, N3 (no write), N7 (counts only).
- [ ] **Step 4:** run → PASS; `pnpm test`, `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(profile): enhanceProfile action — one fast call, filtered, unsaved`

### Task 9: Review sheet

**Files.**
- Create `app/(app)/profile/enhance-sheet.tsx` (`"use client"`)
- Test `tests/app/enhance-sheet.test.tsx`

**Interfaces.**
- `export const ENHANCE_OPEN_EVENT = "roleform:enhance-open"`
- `export function EnhanceButton(): JSX.Element` — a `Button variant="secondary"` with `<Sparkles className="lucide h-4 w-4" />` and the label "Enhance profile". Its `onClick` dispatches `window.dispatchEvent(new Event(ENHANCE_OPEN_EVENT))`.
- `export function LimitLine({ status }: { status: EnhanceView })`:
  - always shows `ENHANCE_LIMIT_COPY`
  - `left === null` → "No limit on admin accounts"
  - `left > 0` → `${left} left`
  - `left === 0` with `nextAt` → `None left · next one ${new Date(nextAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
  - reason `suspended` → "Generation is suspended on your account."
  - reason `off` → "Generation is switched off on your account."
- `export function QuestionStep({ questions, answers, onAnswer }: { questions: ProfileQuestion[]; answers: Record<string, string>; onAnswer(id: string, value: string): void })`:
  - `text` questions use `Textarea` with `maxLength={ENHANCE_ANSWER_MAX}`.
  - `date` questions use `Input` with `placeholder="YYYY-MM"`.
  - Copy: "Your answers go in exactly as you type them. Skip any you can't answer."
- `export function ReviewStep({ proposals, accepted, onToggle, dropped }: { proposals: ProfileProposal[]; accepted: ReadonlySet<string>; onToggle(path: string): void; dropped: number })`:
  - Each `.card` holds a checkbox (`checked={accepted.has(path)}`), a `.tag` of Rephrase, Tidy or Remove, the reason, and a two-column grid of "Before" and "After". A remove shows the before text struck through and "Removed from your profile".
  - When `dropped > 0`, show a `.note`: `${dropped} suggestion${s} were withheld because they changed a number or added something your profile doesn't say.`
- `export function EnhanceSheet({ open, onOpenChange, status, held, onApply }: { open: boolean; onOpenChange(o: boolean): void; status: EnhanceView; held: boolean; onApply(accepted: ProfileProposal[], answers: AnsweredQuestion[]): void })`:
  - Radix `Dialog`. The overlay is `fixed inset-0 z-50 bg-[var(--color-scrim)] backdrop-blur-[3px]`; the content is `dialog pop-in fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(46rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto`.
  - Title: "Enhance your profile". Lead: "Suggestions to tighten what you've written. Nothing is invented — every change keeps your numbers and adds no new tools, titles or claims. Nothing is saved until you press Save profile."
  - Phases are `intro → loading → questions (if any) → review`.
  - Intro: if `held`, show the note "Save or undo your last enhancements first." Otherwise show "Find improvements", disabled when `view.reason !== "ok"`, with `busy` while loading. While loading, ignore `onOpenChange(false)`.
  - On `ok`: set `accepted = new Set(preselected(...))`, update `view` from the result's `status`.
  - On `quota_exhausted` with `detail`: set `view = { left: 0, nextAt: detail, reason: "used" }` and show the message in an `ErrorRegion`.
  - No proposals and no questions: "Nothing to change — your profile reads cleanly."
  - Apply button: `Apply ${n} change${s}`, where n is ticked proposals plus non-empty answers. It calls `onApply`, then closes and resets to intro.

- [ ] **Step 1: failing tests.** `renderToStaticMarkup` with the global-React shim from `tests/app/learning-lanes.test.tsx`.
  - `LimitLine`:
    - `{left:1,nextAt:null,reason:"ok"}` → has "2 every 24 hours, on every plan" and "1 left"
    - `{left:0,nextAt:"2026-11-07T08:00:00.000Z",reason:"used"}` → has "next one"
    - `left: null` → "No limit on admin accounts"
    - reason `suspended` → "suspended"
  - `ReviewStep` with `[tidy H1, remove H2]`, accepted `{H1.path}`, `dropped: 2`:
    - has "Before", "After", "helped with  the design system", "Helped with the design system.", "Tidy", "Remove", "Removed from your profile", "2 suggestions were withheld"
    - `html.match(/checked=""/g)?.length` is 1
  - `QuestionStep` shows a question's prompt and hint; a date question renders `placeholder="YYYY-MM"`; a text question renders `maxLength="1000"`.
  - `EnhanceButton` html has "Enhance profile".
- [ ] **Step 2:** `pnpm vitest run tests/app/enhance-sheet.test.tsx` → FAIL: module not found.
- [ ] **Step 3:** implement. Only DS classes and tokens; no hex values; Lucide through the `lucide` class.
- [ ] **Step 4:** run → PASS; `pnpm test` (token-copy) and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `feat(profile): enhance review sheet — questions, before→after, apply`

### Task 10: Wire into ProfileEditor and the page

**Files.**
- Modify `app/(app)/profile/profile-editor.tsx` and `app/(app)/profile/page.tsx`
- Test `tests/app/profile-editor.test.tsx`

**Interfaces.**
- `export function autosaveAllowed(a: { firstRender: boolean; held: boolean }): boolean`
- New `Props.enhance: EnhanceView | null`

**Editor edits:**
1. New state: `held`, `snapshot = useRef<StoredResume | null>(null)`, `enhanceOpen`, `enhanceNote: string | null`.
2. The autosave effect (lines 65–74) gates on `autosaveAllowed` and returns before `setStatus("saving")` while held.
3. A window listener for `ENHANCE_OPEN_EVENT` sets `enhanceOpen`.
4. A `beforeunload` handler is active only while `held`.
5. `onApply` runs `applyProposals(resume, …)`, sets `snapshot.current = resume`, `setHeld(true)`, `setEnhanceNote(skipped ? `${applied} applied, ${skipped} skipped — those lines had changed.` : `${applied} applied.`)`, then `setResume(out.resume)`.
6. The Save button (line ~900) first runs `setHeld(false)` and `snapshot.current = null`.
7. While held, the status line (~913) shows `${enhanceNote} Not saved yet — press Save profile to keep them.` with a ghost "Undo" button that restores the snapshot and clears held.
8. Render `{enhance ? <EnhanceSheet … /> : null}` as the first child of the left column, before `{tokenPanel}`.

**Page edits:**
1. Import `featureEnabled`, `readEnhanceAllowance`, `enhanceView`, `EnhanceButton`.
2. After line 47 add: `const enhanceStatus = (await featureEnabled("profile_enhance")) ? await readEnhanceAllowance(userId) : null; const enhance = enhanceStatus ? enhanceView(enhanceStatus.allowance, enhanceStatus.blocked) : null;`
3. Mount `{enhance ? <EnhanceButton /> : null}` per the Part A coordination note.
4. Add `enhance={enhance}` on `<ProfileEditor>`.

Use `featureEnabled`, not `requireFeaturePage`.

- [ ] **Step 1: failing tests.**
  - `autosaveAllowed({firstRender:true, held:false})` is false; `{false,false}` is true; `{false,true}` is false.
  - With `vi.mock("@/app/actions/onboarding")` and `vi.mock("@/app/actions/profile")`, `renderToStaticMarkup(<ProfileEditor initial={base()} enhance={null} … tokenPanel={null} />)` contains "Save profile". With `enhance={{left:2,nextAt:null,reason:"ok"}}` it still renders and does not contain "Enhance your profile" (the dialog is closed).
- [ ] **Step 2:** `pnpm vitest run tests/app/profile-editor.test.tsx` → FAIL `autosaveAllowed is not a function`.
- [ ] **Step 3:** make the edits above.
- [ ] **Step 4:** run → PASS; `pnpm test` and `pnpm -s typecheck` green. Then check it by hand with `pnpm dev` on /profile:
  - press Enhance → answer a question → untick one change → Apply
  - wait 3 s and reload → nothing saved
  - redo it and press Save → the changes persist and the cited bullet's evidence count stays on its text
  - Undo restores the previous text
  - with the switch off in /admin, the button is gone
- [ ] **Step 5:** hand to jiraiya: `feat(profile): Enhance button opens the sheet; applied changes wait for Save`

### Task 11: Docs

**Files.** Modify `CLAUDE.md`, `docs/product/rules.md`, `docs/product/specs.md`, `lib/domain/quotas.ts`. Tests: the existing `tests/structure/claude-md.test.ts`.

- [ ] **Step 1: failing test.** Add to `tests/structure/claude-md.test.ts`: the `| N22 |` row contains "never a `QuotaKey`", "two profile enhances per 24 hours (F34)" and "one portfolio build per account (F28)". The same three strings appear in the `| N22 |` row of `docs/product/rules.md`.
- [ ] **Step 2:** `pnpm vitest run tests/structure/claude-md.test.ts` → FAIL.
- [ ] **Step 3: edits.**
  - **N22 in both files:** append this to the rule cell, verbatim: "A limit identical on every plan is not plan-gated and is never a `QuotaKey`: it is a named constant in `lib/domain/` (or a constraint), enforced at its seam by counting rows, stated on its own surface, never varied by plan or per member, and lifted for admins like every cap. Today: one portfolio build per account (F28) and two profile enhances per 24 hours (F34). If it ever differs by plan it becomes a `QuotaKey` first."
  - **CLAUDE.md §13:** after the `CatalogSync` entry add "and for profile enhance (F34) `ProfileProposal` (a suggested rephrase, tidy or removal of one profile field — applied only when the member ticks it and saves) and `ProfileQuestion` (a deterministic question whose answer goes in verbatim),".
  - **New `### F34 — Profile enhance (Nov 2026)` section** in `specs.md`, before `## 10. AI layer`. It must state:
    - the button, the three steps, and that applied changes are held until Save (Undo restores)
    - one `enhance_profile` call over content fields only, never `basics` contact or location (N7)
    - rephrase, tidy or remove only; the deterministic filter (`checkFabrication` against the original text, `numbersPreserved`, no remove of a numbered bullet, one per path); duplicate-skill removals are deterministic
    - questions are deterministic and answers are inserted verbatim with no second call
    - 2 per 24 h counted from `ai_runs` `schema_valid` rows, 6 attempts, identical on every plan, admins uncapped, not a `QuotaKey`, not on pricing, `PLAN_ROWS` or the usage panel
    - unmetered (`UNMETERED_PURPOSES`)
    - proposals are not stored; switch `profile_enhance`
  - **§10 table row:** `| \`enhance_profile\` (F34) | \`enhanceProfile\` | \`profileEnhanceSchema(fields)\` | writer-fast | 1 | — (deterministic filter; member reviews every line) |`
  - **§14** after `updateProfile`: `enhanceProfile()                       → { proposals, questions, dropped, status } // F34, 2 per 24 h on every plan (not a QuotaKey); one writer-fast call; unmetered; writes only its ai_runs row`
  - **F19 blockquote**, add a sentence: "`enhance_profile` runs (F34) are excluded from the meter — usage, the carry rule and the admin per-member figure (`UNMETERED_PURPOSES`); the workspace total still counts them."
  - **`quotas.ts` tokens description:** append " Profile enhance (F34) is not metered here — it has its own flat limit of 2 every 24 hours."
- [ ] **Step 4:** run → PASS; `pnpm test` (the claude-md path check) and `pnpm -s typecheck` green.
- [ ] **Step 5:** hand to jiraiya: `docs(enhance): F34 spec, N22 amendment, unmetered purpose`

## Review focus for neji

- **The autosave hold.** Look for any path that saves held enhancements without Save:
  - the effect's stale `held` closure
  - Undo setting `resume` (it should autosave the snapshot — intended)
  - Next `Link` navigation, which `beforeunload` doesn't cover (changes lost silently — acceptable, but confirm the copy says "Not saved yet")
- **`applyProposals` index maths.** Multiple removals plus edits plus appends in one array; the `bulletIds` re-key with project paths; the stale-`before` guard when autosave raced the request (the DB profile the action read vs editor state).
- **N7 at every exit.** The prompt builder input (`enhanceableFields` never reads `basics` beyond `summary`), the `console.info` line, `AppError.detail` (an ISO time only), and the PII guard turning a 7-plus-digit metric into `[PHONE]`. That last one should cause the proposal to be dropped by `numbersPreserved`, not leak or invent a number.
- **Meter exclusion parity.** `usageByCycle`'s `<> all(${array}::text[])` under `@prisma/adapter-pg` has no DB test — confirm the array binds. `workspaceStats` must stay inclusive.
- **The `numbersIn` trailing-punctuation change** in `lib/domain/fabrication.ts` loosens tailoring's metric check only for "40" vs "40." — confirm nothing else (decimals like "3.5", "$1.4m.") changes meaning. Also check the `no_urls`/`tone` output guards against member text the model must keep (a bullet containing "weakness").
