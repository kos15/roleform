-- Raise everyone who already had "all templates" so they still have all of them.
--
-- The previous migration changed the column DEFAULT to 11 and widened the CHECK
-- ceiling. Neither touches a row that already exists — so every account
-- provisioned before v2.7 stayed at 6, and 6 stopped meaning what it meant.
--
-- Before: 6 was the maximum. A member at 6 had every template there was.
-- After:  6 is five short, and two of the five missing are High-ATS layouts —
--         Keystone especially, which is the strongest-parsing template that
--         does not look like a plain-text document.
--
-- So the fix is scoped to that exact reading: anyone sitting at the OLD MAXIMUM
-- is moved to the NEW MAXIMUM, because their cap meant "everything" and should
-- go on meaning it. Anyone below 6 was deliberately capped by an admin or by
-- their plan, and is left exactly where they are — a data migration that
-- quietly hands out entitlements nobody granted is a worse bug than the one it
-- fixes.
UPDATE "users"
   SET "cap_resumes" = 11
 WHERE "cap_resumes" = 6;

-- Same rule for the value new members are provisioned with. On this deployment
-- it is 2 (the Free plan's published cap), so this is a no-op here — it is
-- written for environments that were seeded at the old maximum instead.
UPDATE "workspace_settings"
   SET "cap_resumes" = 11
 WHERE "cap_resumes" = 6;

-- Deliberately NOT done: re-rendering résumé drafts for past analyses. An
-- analysis is a record of what we produced at the time, and specs §6.2
-- invariant 4 says profile edits never rewrite history. New runs get eleven;
-- old ones keep the six they were generated with.
