# Pricing Without Tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members see and hit operation counts only; tokens become a hidden fair-use ceiling; top-ups become extra-analysis packs; a new practice-sessions quota.

**Architecture:** `practice` joins `QUOTAS` the N22 way. `tokens` stays a `QuotaKey` but is marked `internal`. Top-ups grant analyses into a new `AnalysisGrant` table read by the analyses cap check. Copy changes are gated by a grep script.

**Tech Stack:** Next.js 15, TypeScript strict, Prisma/Postgres, Razorpay.

**Spec:** `docs/superpowers/specs/2026-10-21-pricing-without-tokens-design.md`

**Order:** Run after `2026-10-21-gpt5-agents-jev-checkers.md` Task 8 (calibrated worst-case costs feed Task 3 here). Tasks 1, 2, 4 do not depend on it.

## Global Constraints

- No test suite (CLAUDE.md §11): `pnpm check:*` fixture scripts + `pnpm typecheck`; fixture first, see it fail.
- N21 unchanged: nothing raises a plan or grants a purchase except the captured-payment webhook at the right amount.
- N22: every member-facing limit is a printed count; the only unprinted quota is `tokens`, shown as "Fair-use limit applies".
- New column ⇒ CHECK constraint in the migration SQL; new user table ⇒ RLS policy in `lib/db/policies.sql` (N10).
- No "token" in any member-facing copy (spec §6 grep gate). Admin (`app/(app)/admin/**`, `app/actions/admin.ts`) keeps tokens.
- Prices unchanged: packs `+5 analyses ₹99` (`topup-5a`, 9,900 paise), `+15 analyses ₹249` (`topup-15a`, 24,900 paise).
- Practice defaults Free/Pro/Ultra: `3 / 40 / 150`.
- Fair-use ceiling = Σ(cap × measured worst-case tokens) × 1.25, plus bonus analyses × worst-case analysis cost.
- Unspent token top-ups convert at the **pre-change** `RUN_ESTIMATE`, rounded up.

## Review Focus

- A member with bonus analyses and an exhausted monthly cap can still start an analysis, and the bonus decrements — Task 2.
- A member at the fair-use ceiling sees no number and no word "token" — Task 3 copy fixture + Task 5 gate.
- A replayed Razorpay webhook must not grant analyses twice (unique `reference`) — Task 2.
- Practice cap counts a deck, a quiz round and a challenge start, but not a code review — Task 1.
- Migration run twice must not double-convert — Task 2 (idempotent by a marker grant `source = "token_conversion"`).

---

### Task 1: `practice` quota

**Files:** `prisma/schema.prisma` (`User.capPractice Int @default(3) @map("cap_practice")`), migration (+ `CHECK (cap_practice >= 0)`), `lib/domain/quotas.ts`, `lib/content/pricing.ts` (`PLANS[].caps.practice`, `NOTES.practice`), `lib/plans/catalog.ts` if it lists caps, `app/actions/drill.ts`, admin cap editor if it enumerates `QUOTAS`, `scripts/quota-fixtures.ts` (`check:quotas`)

**Interfaces:** `QuotaKey` gains `"practice"` (`label: "Practice sessions"`, `unit: "per month"`). `countPracticeThisCycle(clerkUserId: string, since: Date): Promise<number>` in `lib/db/queries/entitlement.ts` = rows created since cycle start in `revision_decks` + `quiz_rounds` + `coding_challenges`. `requirePracticeCap(clerkUserId): Promise<Result<null>>` in `lib/auth.ts`, using the existing `buildCapWall(…, "practice", …)` shape.

- [x] **Step 1:** Fixture: `QUOTAS.some(q => q.key === "practice")`; `PLANS.map(p => p.caps.practice)` deep-equals `[3, 40, 150]`; `displayCap("practice", 0) === "Off"`.
- [x] **Step 2:** `pnpm check:quotas` → FAIL; implement; → `ok`.
- [x] **Step 3:** Call `requirePracticeCap` before `buildRevisionDeck`, `startQuizRound` and challenge start in `app/actions/drill.ts` (not in code review). `pnpm typecheck` clean.
- [x] **Step 4:** Commit `feat(plans): practice sessions quota`.

### Task 2: Analysis grants, new packs, webhook, conversion

**Files:** `prisma/schema.prisma` (`AnalysisGrant { id, clerkUserId, analyses Int, source String, reference String @unique, createdAt }`, `@@map("analysis_grants")`), migration (+ `CHECK (analyses > 0)`), `lib/db/policies.sql` (own rows), `lib/content/pricing.ts` (`TOPUPS` → `{ id, analyses, price, pricePaise, note }`), `lib/domain/quotas.ts` or `lib/domain/entitlements.ts` (pure helper), `lib/auth.ts` (analyses cap reads grants), `app/api/webhooks/razorpay/route.ts` (`creditTopup` writes `AnalysisGrant`), `app/actions/checkout.ts`, `scripts/convert-token-topups.ts` (`"topups:convert"`), `scripts/quota-fixtures.ts`

**Interfaces:** pure `analysesAvailable(args: { cap: number; usedThisCycle: number; bonusGranted: number; bonusSpent: number }): { allowed: boolean; fromBonus: boolean }`. Bonus is spent only after `usedThisCycle >= cap`; `bonusSpent` = analyses created this and earlier cycles beyond the cap, measured (same "by measurement" approach as `unspentTopups`). `convertedAnalyses(unspentTokens: number, runEstimate: number): number` = `Math.ceil(unspentTokens / runEstimate)`.

- [x] **Step 1:** Fixtures: cap 3 used 2 bonus 5 → allowed, not from bonus; cap 3 used 3 bonus 5 spent 0 → allowed, from bonus; cap 3 used 3 bonus 5 spent 5 → not allowed; `convertedAnalyses(30_001, 20_000) === 2`; `TOPUPS.map(t => [t.analyses, t.pricePaise])` deep-equals `[[5, 9900], [15, 24900]]`.
- [x] **Step 2:** `pnpm check:quotas` → FAIL; implement; → `ok`.
- [x] **Step 3:** Webhook: amount must equal the pack's `pricePaise`; duplicate `reference` → swallow as today.
- [x] **Step 4:** `topups:convert` script: dry-run by default printing counts only; `--apply` writes one `AnalysisGrant` per member with unspent tokens, `source: "token_conversion"`, `reference: "conv:<userId>"` (unique ⇒ idempotent). Pre-change `RUN_ESTIMATE` is copied into the script as a constant with a comment.
- [x] **Step 5:** Razorpay test mode on dev: buy `+5 analyses` → grant row; replay webhook → no second row. `pnpm typecheck` clean.
- [x] **Step 6:** Commit `feat(plans): extra-analysis packs replace token top-ups`.

### Task 3: Tokens become the fair-use ceiling

**Files:** `lib/domain/quotas.ts` (`QuotaDefinition.internal?: true`, set on `tokens`), `lib/domain/tokens.ts` (`fairUseCeiling`), `lib/content/pricing.ts` (`PLANS[].caps.tokens` from `fairUseCeiling`), `components/token-wall.tsx` (copy), `lib/auth.ts` `checkTokenAllowance` (ceiling includes bonus), `scripts/quota-fixtures.ts`

**Interfaces:** `fairUseCeiling(caps: Record<Exclude<QuotaKey,"tokens">, number>, worstCase: Record<SpendKind, number>, bonusAnalyses = 0): number` = Σ over metered ops (analyses → analysis worst case, answers, practice → max of revision/quiz/challenge, roadmaps 0, jobSearches 0, resumes/courses already inside an analysis) × 1.25 + bonusAnalyses × worstCase.analysis, rounded up to the next 10,000. Worst-case numbers come from agents-plan Task 8.

- [x] **Step 1:** Fixture: with worst cases `{ analysis: 40_000, answer: 3_000, revision: 6_000, quiz: 4_000, challenge: 8_000 }` and Pro caps (40 analyses, 40 answers, 40 practice) → `fairUseCeiling` equals `Math.ceil(((40*40000 + 40*3000 + 40*8000) * 1.25) / 10000) * 10000` (= 2,550,000); every `PLANS[p].caps.tokens >= fairUseCeiling(PLANS[p].caps, WORST_CASE)`.
- [x] **Step 2:** `pnpm check:quotas` → FAIL; implement; → `ok`.
- [x] **Step 3:** Token wall copy: title "You've reached this cycle's fair-use limit"; body "It resets on {date}." Exits unchanged except "Buy tokens" → "Buy extra analyses". No numbers.
- [x] **Step 4:** Commit `feat(plans): tokens become an internal fair-use ceiling`.

### Task 4: Remove tokens from every member surface

**Files:** Create `scripts/token-copy-gate.ts` (`"check:tokencopy"`). Modify per spec §5.4: `components/token-pill.tsx` (delete) and its mount in `app/(app)/layout.tsx` / nav, `components/low-balance-banner.tsx`, `low-balance-notice.tsx` (count-based: shows when any of analyses/answers/practice has ≤ 1 left: "1 analysis left this cycle"), `app/(app)/profile/token-panel.tsx` → `usage-panel.tsx` (counts used/cap per visible quota + bonus analyses), `components/sheet-account.tsx`, `renewal-banner.tsx`, `renewal-notice.tsx`, `cap-wall.tsx`, `app/(app)/analyze/jd-input.tsx`, `queued-runs.tsx`, `app/(app)/analysis/[id]/parsing-screen.tsx`, `prep/answer-panel.tsx`, `rapid/*` (drop "About N tokens" lines), `app/(marketing)/pricing/page.tsx` (drop "What a token is"; top-ups section "Need more analyses?"; footnote "Fair-use limit applies"), `lib/content/pricing.ts` (`compareRows` skips `internal`, drop "What a full run costs" row, `PRICING_REFUSALS` reworded per spec §5.4, `BILLING_FAQ` mentions none), `lib/seo/markdown.ts`, `lib/seo/schema.ts`, `lib/content/guides.ts`, `lib/content/docs.ts`, `generateMetadata` on /pricing.

**Interfaces:** gate script scans `app/**` (excluding `app/(app)/admin/**`, `app/actions/admin.ts`, `app/api/**`), `components/**`, `lib/content/**`, `lib/seo/**` for JSX text and string literals matching `/\btokens?\b/i`; allowlist comments, identifiers and import paths; exits 1 listing `file:line`.

- [x] **Step 1:** Write the gate; `pnpm check:tokencopy` → FAIL listing today's hits.
- [x] **Step 2:** Change surfaces until `pnpm check:tokencopy` → `ok`; `pnpm typecheck` clean.
- [x] **Step 3:** Look at /pricing, the nav, /profile, the analyse screen and a cap wall on the dev server (screenshots as earlier in this repo's history).
- [x] **Step 4:** Commit `feat(pricing): operation counts only — tokens removed from member surfaces`.

### Task 5: Rules, specs, verification

**Files:** `CLAUDE.md` N22 (append: "A quota may be internal — unprinted — only if it is a fair-use ceiling sized so every printed count binds first; the page then says 'Fair-use limit applies'."), `specs.md` F15/F17/F19 (practice quota, packs, fair use), `scripts/convert-token-topups.ts` run on preview with `--apply`.

- [x] **Step 1:** Update docs.
- [x] **Step 2:** Preview deploy: as a Free member hit the analyses cap, the practice cap, buy a pack in Razorpay test mode and run one more analysis; `pnpm check:quotas`, `pnpm check:tokencopy`, `pnpm typecheck` all `ok`.
- [x] **Step 3:** Commit `docs: N22 fair-use ceiling; specs for counts-only pricing`.
