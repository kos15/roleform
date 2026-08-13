-- Move the precision bar off the columns and onto the risk it was built for.
--
-- RLE spec §1: "a resource that cannot be bound to all three is not shown."
-- Built first as two NOT NULL columns on learning_steps. Measured against a
-- real profile it withheld vetted material for 5 of 6 gaps — the corpus had
-- good Kubernetes and GraphQL resources and the bar hid them, because no
-- résumé bullet and no interview question happened to bind.
--
-- The risk that rule exists to stop is a FALSE binding, not an absent one. A
-- card offering two vetted Kubernetes resources and claiming nothing about the
-- candidate's history makes no false claim. A card claiming the wrong bullet
-- does. So the bindings become nullable, and the guarantee moves to the state
-- that is actually dangerous.

-- ── nullable bindings ──────────────────────────────────────────────────────
-- Set only by the deterministic binder (lib/domain/binding.ts), which returns
-- null rather than something arbitrary. Never by a model. The foreign keys are
-- unchanged, so a binding that IS present still has to point at a real row.
ALTER TABLE "learning_steps" ALTER COLUMN "unlocks_bullet_id" DROP NOT NULL;
ALTER TABLE "learning_steps" ALTER COLUMN "answers_question_id" DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ★ THE GUARD THAT REPLACES THEM — guardrails.md OUT-2.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A staged rewrite with no source bullet is the one state OUT-2 forbids
-- outright: "`unlocks_bullet` must be traceable to an existing resume span.
-- No span → rejected, no exceptions." Nullable bindings make that state
-- reachable for the first time, so it gets a CHECK in the same migration that
-- opens the door — not a follow-up.
--
-- This is the fabrication guard that matters. The old NOT NULLs guarded
-- against a missing binding, which is merely unhelpful. This guards against a
-- rewrite of a bullet the user never wrote, which is the product's whole
-- promise (CLAUDE.md §3).
ALTER TABLE "skill_gaps"
  ADD CONSTRAINT "skill_gaps_draft_needs_bullet"
  CHECK ("unlocks_bullet_draft" IS NULL OR "unlocks_bullet_id" IS NOT NULL);
