-- Repair the two fabrication CHECKs, which have been inert since M1.
--
-- `array_length(anyarray, 1)` returns NULL for an EMPTY array, not 0. So for a
-- non-gap question with no evidence the guard evaluated:
--
--     type = 'gap' OR array_length(evidence_bullet_ids, 1) > 0
--     false        OR (NULL > 0)
--     false        OR NULL
--     = NULL
--
-- and a CHECK constraint only rejects a row when it evaluates to FALSE. NULL
-- passes. Both constraints were therefore accepting exactly the rows they were
-- written to forbid — including the one N2 exists to make unrepresentable.
--
-- Caught by the constraint smoke test only after it was seeded properly: the
-- original case inserted a random `analysis_id`, so the foreign key rejected
-- the row first and the guard reported PASS on a 23503 it had not earned. The
-- test now pins the expected SQLSTATE to the CHECK's own 23514.
--
-- `cardinality()` is the fix and not `coalesce(array_length(...), 0)`: it
-- returns 0 for an empty array and never NULL, so the expression cannot go
-- three-valued again. Same reason the rest of this schema prefers a constraint
-- to a remembered check (CLAUDE.md §11).
--
-- Verified before writing this: zero rows in either table violate the repaired
-- constraints, so both ALTERs apply without a cleanup step. The Zod schemas at
-- the AI boundary (N6) are what has actually been holding this line.

-- ★ FABRICATION GUARD #2 (N2) — evidence, or explicitly a gap question.
ALTER TABLE "interview_questions"
  DROP CONSTRAINT IF EXISTS "interview_questions_evidence_or_gap";

ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_evidence_or_gap"
  CHECK ("type" = 'gap' OR cardinality("evidence_bullet_ids") > 0);

-- An 'evidenced' verdict without evidence is a lie the DB will not store (N4).
ALTER TABLE "coverage_items"
  DROP CONSTRAINT IF EXISTS "coverage_items_evidenced_has_evidence";

ALTER TABLE "coverage_items" ADD CONSTRAINT "coverage_items_evidenced_has_evidence"
  CHECK ("status" <> 'evidenced' OR cardinality("evidence_bullet_ids") > 0);
