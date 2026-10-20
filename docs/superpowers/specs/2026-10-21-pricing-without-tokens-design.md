# Pricing without tokens

Date: 2026-10-21 · Status: approved by the owner 2026-10-21
Companion to `2026-10-21-agent-architecture-design.md` (which keeps metering tokens internally).

## 1. Intent

Members should see **what they can do**, not a unit of model consumption. Pricing, navigation and
every limit message speak in operations — analyses, résumé drafts, answer drafts, practice sessions,
roadmaps, job searches — and benefits. "Token" disappears from everything a member sees.

**Owner decisions:** the operation counts are the real limits members hit. Tokens stay only as a
hidden **fair-use ceiling**, set high enough that normal use of the counts never reaches it.
Top-ups are sold as **extra analyses**, not token packs.

## 2. Goals

- G1. No member-facing surface shows a token number, a token estimate or the word "token":
  pricing page, nav bar, profile, banners, dialogs, buttons, the `/pricing.md` mirror, guides,
  JSON-LD, metadata.
- G2. Every limit a member can hit is a count printed on the pricing page (N22 holds).
- G3. Top-ups are "+N analyses" packs that never renew and never expire (today's top-up promise,
  restated in analyses).
- G4. The admin panel keeps full token visibility — operators still need cost.

## 3. Non-goals

- No change to prices, plan names or the payment flow (Razorpay, N21).
- No change to how tokens are measured (`ai_runs`), only to who sees them.

## 4. Anti-goals

- **A hidden limit members hit in normal use.** If the fair-use ceiling binds before the visible
  counts for an ordinary member, the page is lying (N22). The ceiling is sized from measured
  worst-case runs, not averages.
- **"Unlimited" anywhere it is not.** Practice sessions get a real count.
- **Losing what members paid for.** Unspent token top-ups are converted, never dropped.

## 5. Design

### 5.1 The limits members see

| Limit | Per | Status |
|---|---|---|
| Analyses | month | exists (`analyses`) |
| Résumé drafts | analysis | exists (`resumes`) |
| Full answer drafts | month | exists (`answers`) |
| Course matches | gap | exists (`courses`) |
| Roadmaps | month | exists (`roadmaps`) |
| Job searches | month | exists (`jobSearches`) |
| **Practice sessions** | month | **new QuotaKey `practice`** — a revision deck build, a quiz round or a code challenge each count one; a code review inside a challenge does not (it is bounded by the challenge). Free/Pro/Ultra defaults: 3 / 40 / 150 (the analyses numbers — *my call*, admin-editable). |

`practice` is added the N22 way: a `cap_practice` column with its CHECK, a `PLANS` value, a `NOTES`
line, and an enforcement seam in `app/actions/drill.ts` that counts rows (`revision_decks`,
`quiz_rounds`, `coding_challenges` created this cycle).

### 5.2 Tokens become the fair-use ceiling

- `tokens` stays a `QuotaKey` and a column, enforced exactly where it is today
  (`checkTokenAllowance`), but it is marked **internal**: the pricing page prints it as one line —
  "Fair-use limit applies" — not a number. **CLAUDE.md N22 is amended** to say so: a quota may be
  internal only if it is a fair-use ceiling sized so the printed counts bind first.
- Ceiling per plan = (each operation cap × that operation's **measured worst-case** cost under the
  GPT-5 agents, reasoning tokens included) summed, plus 25 % headroom. Recalibrated with
  `scripts/tokens-calibrate.ts` after the agent work lands. Bonus analyses raise it by the same
  per-analysis amount.
- Hitting the ceiling shows a plain message with no numbers: "You've reached this cycle's fair-use
  limit. It resets on <date>." The dialog's exits stay (wait, upgrade, buy extra analyses).

### 5.3 Top-ups → extra analyses

- Packs: **+5 analyses ₹99**, **+15 analyses ₹249** (same prices; counts chosen to match today's
  "about 5 / 15 more full analyses" copy — *my call*). Paid plans only, never renew, never expire;
  spent after the plan's monthly analyses run out.
- Stored as a grant of analyses (replacing the token grant), with the same never-expire carry rule.
- **Migration:** each member's unspent token top-up balance converts to bonus analyses at the
  pre-change `RUN_ESTIMATE`, rounded **up**. One-off script, logged as counts only (N7).

### 5.4 Surfaces that change

Remove or reword: `components/token-pill.tsx` (nav — removed), `low-balance-banner.tsx` /
`low-balance-notice.tsx` (become "N analyses left" when a *count* runs low), `token-wall.tsx`
(fair-use wording above), `app/(app)/profile/token-panel.tsx` (becomes a usage panel of counts),
`sheet-account.tsx`, `renewal-*`, `cap-wall.tsx`, the token estimates on drill / answer / analyse
buttons, the pricing page's "What a token is" section and token rows, `lib/content/pricing.ts`
(`compareRows`, `NOTES`, `PRICING_REFUSALS` lines that mention tokens), `lib/seo/markdown.ts`,
`lib/content/guides.ts` / `docs.ts`, JSON-LD and page metadata. Admin surfaces keep tokens.

The pricing page leads with what each plan *does* (counts + benefits); the comparison table shows
counts only; the refusals keep their meaning without the word ("A run you can't afford is refused
before it starts" → "A run over your limit is refused before it starts, never half-run").

## 6. Verification

- Grep gate: no member-facing file under `app/` (excluding `admin`), `components/`, `lib/content`,
  `lib/seo` renders "token" (case-insensitive) after the change.
- Calibration: worst-case run cost per operation measured on the eval fixtures; each plan's
  ceiling ≥ its counts × worst case × 1.25.
- Click through as a Free member to the analyses limit, the practice limit and a top-up purchase in
  Razorpay test mode on a preview deploy.

## 7. Left to the builder

- Exact copy on each surface, within §5.
- Whether `token-pill` is deleted or repurposed as a count pill (nav must not show tokens either way).
- Migration script shape and its dry-run output.
