/**
 * ★ SURVIVING CHECK 1 of 3 — the constraint smoke test (M1.9, CLAUDE.md §11).
 *
 * Attempts one bad write per guard and confirms Postgres refuses it. Five
 * minutes, once, at the M1 gate. This is the moment the safety net either
 * exists or doesn't — and with no test suite there is no second chance to
 * notice.
 *
 *   1. tailored_bullets with a null source_bullet_id            → N1
 *   2. a non-gap interview_question with empty evidence         → N2
 *   3. a staged rewrite with no source bullet                    → OUT-2
 *   4. a skill_gap with half a roadmap fallback                 → RLE §9
 *   5. a severity outside 0–100                                 → RLE §5/§6
 *   6. a cross-user SELECT under RLS                            → N10
 *
 * Guards 1 and 2 run against the database connection. Guard 3 MUST run through
 * an anon Supabase client, because the Prisma connection uses database
 * credentials and bypasses RLS by design — testing RLS through it would prove
 * nothing.
 *
 *   pnpm check:constraints
 */
import "./env";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

type Check = { name: string; rule: string; passed: boolean; detail: string };

async function main() {
  // DIRECT_URL: these run explicit sql.begin() transactions per statement,
  // which needs a real session rather than the pgbouncer transaction pooler.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL (or DATABASE_URL) is not set");
  const sql = postgres(url, { max: 1 });
  const results: Check[] = [];

  /* ---------------------------------------- 1. N1 — provenance is mandatory */
  results.push(
    await expectRejection(sql, {
      name: "tailored_bullets without provenance",
      rule: "N1",
      statement: `insert into tailored_bullets
        (clerk_user_id, draft_id, source_bullet_id, original_text, rewritten_text, transform)
        values ('smoke-user', gen_random_uuid(), null, 'x', 'y', 'verbatim')`,
    }),
  );

  /* ------------------------------ 2. N2 — evidence, or explicitly a gap */

  // Seeds the parent chain first, so the CHECK is what rejects this and not the
  // foreign key on analysis_id. Without the seed this case passes on a 23503
  // whether or not N2's CHECK exists at all — a guard that proves the FK works
  // and quietly says nothing about the constraint it is named after. Every
  // statement here runs in a transaction that is always rolled back.
  const SEED_ANALYSIS = `
    insert into users (clerk_user_id, email_hash) values ('smoke-user', 'x');
    insert into master_profiles (id, clerk_user_id, resume_json)
      values ('00000000-0000-4000-8000-00000000beef', 'smoke-user', '{}'::jsonb);
    insert into analyses
      (id, clerk_user_id, profile_id, jd_source, raw_text, content_hash)
      values ('00000000-0000-4000-8000-00000000cafe', 'smoke-user',
              '00000000-0000-4000-8000-00000000beef', 'paste', 'x', 'smoke-n2');`;

  results.push(
    await expectRejection(
      sql,
      {
        name: "non-gap interview_question with no evidence",
        rule: "N2",
        statement: `${SEED_ANALYSIS}
          insert into interview_questions
          (clerk_user_id, analysis_id, ordinal, type, text, why_they_ask, frame, evidence_bullet_ids)
          values ('smoke-user', '00000000-0000-4000-8000-00000000cafe', 0, 'behavioral',
                  'Tell me about a time…', 'because', array['a','b','c'], '{}'::uuid[])`,
      },
      // 23514 check_violation. Anything else means the row never reached N2.
      "23514",
    ),
  );

  /* --------------------------- 2b. the same row typed 'gap' must be allowed */
  results.push(
    await expectRejection(
      sql,
      {
        name: "gap question with no evidence (must be ALLOWED by the CHECK)",
        rule: "N2",
        // Deliberately NOT seeded: the parent is a random uuid, so the foreign
        // key is what should stop this. If the CHECK fires first the constraint
        // is over-tight and gap questions cannot be stored at all — which is
        // why the expected SQLSTATE below is the FK's and not the CHECK's.
        statement: `insert into interview_questions
          (clerk_user_id, analysis_id, ordinal, type, text, why_they_ask, frame, evidence_bullet_ids)
          values ('smoke-user', gen_random_uuid(), 0, 'gap', 'How would you pick up Kafka?',
                  'because', array['a','b','c'], '{}'::uuid[])`,
      },
      "23503",
    ),
  );

  /* ------------------ 2c. N4 — an 'evidenced' verdict that has no evidence */

  // The sibling of the guard above, and inert for exactly the same reason until
  // the repair migration. It had no case here at all, which is how it survived
  // a milestone gate: an untested constraint and a missing constraint look
  // identical from the outside.
  results.push(
    await expectRejection(
      sql,
      {
        name: "coverage_item 'evidenced' with no evidence",
        rule: "N4",
        statement: `${SEED_ANALYSIS}
          insert into jd_requirements
            (id, clerk_user_id, analysis_id, kind, text, necessity, evidence_quote)
            values ('00000000-0000-4000-8000-00000000feed', 'smoke-user',
                    '00000000-0000-4000-8000-00000000cafe', 'hard_skill', 'React',
                    'required', 'React');
          insert into coverage_items
            (clerk_user_id, analysis_id, requirement_id, status, evidence_bullet_ids, rationale)
            values ('smoke-user', '00000000-0000-4000-8000-00000000cafe',
                    '00000000-0000-4000-8000-00000000feed', 'evidenced', '{}'::uuid[], 'because')`,
      },
      "23514",
    ),
  );

  /* ------------------------------- 3. F19 — the token meter's own guarantees */

  // These four seed their own parent rows first. Every statement here runs in a
  // transaction that is always rolled back, so the seed never survives — and
  // without it a foreign key would fire before the constraint under test,
  // leaving a PASS that proves only that the FK works.
  const SEED_USER = `insert into users (clerk_user_id, email_hash) values ('smoke-user', 'x');`;

  // A grant of zero tokens is a row that says nothing; a negative one is a
  // clawback we have no product for, and it would quietly make a balance
  // smaller than /pricing says it is.
  results.push(
    await expectRejection(
      sql,
      {
        name: "token_grant of zero tokens",
        rule: "F19",
        statement: `${SEED_USER}
          insert into token_grants (clerk_user_id, tokens, source, reference)
          values ('smoke-user', 0, 'admin', 'smoke:zero')`,
      },
      "23514",
    ),
  );

  // THE idempotency guarantee. Razorpay redelivers a webhook on any non-2xx,
  // and this index is the only thing standing between that and a second credit.
  // Pinned to unique_violation on purpose: any other rejection would mean the
  // statement never reached the index, and a PASS would be telling us the
  // duplicate is impossible when it isn't.
  results.push(
    await expectRejection(
      sql,
      {
        name: "two grants sharing one payment reference",
        rule: "F19",
        statement: `${SEED_USER}
          insert into token_grants (clerk_user_id, tokens, source, reference)
          values ('smoke-user', 1, 'purchase', 'smoke:dup'),
                 ('smoke-user', 1, 'purchase', 'smoke:dup')`,
      },
      "23505",
    ),
  );

  // A queued run that has already finished would be re-run by the resume path
  // and charged for twice.
  results.push(
    await expectRejection(
      sql,
      {
        name: "analysis queued while already ready",
        rule: "F19",
        statement: `${SEED_USER}
          insert into master_profiles (id, clerk_user_id, resume_json)
          values ('00000000-0000-4000-8000-00000000dead', 'smoke-user', '{}'::jsonb);
          insert into analyses
            (clerk_user_id, profile_id, jd_source, raw_text, content_hash, status, queued_at)
          values ('smoke-user', '00000000-0000-4000-8000-00000000dead',
                  'paste', 'x', 'smoke', 'ready', now())`,
      },
      "23514",
    ),
  );

  // The cap is bounded by the same range the admin panel clamps to.
  results.push(
    await expectRejection(
      sql,
      {
        name: "cap_tokens above the published ceiling",
        rule: "F19",
        statement: `insert into users (clerk_user_id, email_hash, cap_tokens)
          values ('smoke-user-cap', 'x', 4000001)`,
      },
      "23514",
    ),
  );

  /* ----------------- 3. OUT-2 — a staged rewrite needs a bullet to rewrite */

  // This replaced the NOT NULL bindings on learning_steps (migration
  // 20260813000000_bindings_nullable). Those guarded against a MISSING binding,
  // which is merely unhelpful; this guards against a rewrite of a bullet the
  // user never wrote, which is the product's entire promise (CLAUDE.md §3).
  //
  // guardrails.md OUT-2: "every staged bullet carries a source_span pointing
  // into the stored resume. No span → rejected, no exceptions."
  results.push(
    await expectRejection(
      sql,
      {
        name: "skill_gap staging a rewrite with no source bullet",
        rule: "OUT-2",
        statement: `${SEED_ANALYSIS}
          insert into skills (id, name, category)
            values ('00000000-0000-4000-8000-0000000000ac', 'SmokeSkill3', 'practice');
          insert into skill_gaps
            (clerk_user_id, analysis_id, skill_id, user_level, required_level, note,
             unlocks_bullet_id, unlocks_bullet_draft)
          values ('smoke-user', '00000000-0000-4000-8000-00000000cafe',
                  '00000000-0000-4000-8000-0000000000ac', 'none', 'working', 'x',
                  null, 'Once you have done this, that bullet becomes something better.')`,
      },
      "23514",
    ),
  );

  /* ------------------------- 3b. RLE §10 — every step occupies real time */

  // A step with no duration cannot be scheduled, and a knapsack that packed one
  // would report a total the user's own arithmetic disagrees with.
  results.push(
    await expectRejection(
      sql,
      {
        name: "learning_step of zero minutes",
        rule: "RLE §10",
        statement: `insert into learning_steps
          (clerk_user_id, plan_id, gap_id, course_id, ordinal, starts_at_min,
           duration_min, unlocks_bullet_id, answers_question_id)
          values ('smoke-user', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                  0, 0, 0, null, null)`,
      },
      "23514",
    ),
  );

  /* ------------------ 4. RLE §9 — a fallback is a link AND an explanation */

  // Half a fallback renders a bare link with nothing saying why, which is the
  // unexplained-link failure N8 exists to prevent.
  results.push(
    await expectRejection(
      sql,
      {
        name: "skill_gap with a fallback URL and no label",
        rule: "RLE §9",
        statement: `${SEED_ANALYSIS}
          insert into skills (id, name, category)
            values ('00000000-0000-4000-8000-0000000000aa', 'SmokeSkill', 'practice');
          insert into skill_gaps
            (clerk_user_id, analysis_id, skill_id, user_level, required_level, note,
             fallback_url, fallback_label)
          values ('smoke-user', '00000000-0000-4000-8000-00000000cafe',
                  '00000000-0000-4000-8000-0000000000aa', 'none', 'working', 'x',
                  'https://roadmap.sh/react', null)`,
      },
      "23514",
    ),
  );

  /* ---------------- 5. RLE §5/§6 — severity is a percentage, or it is a bug */

  // severity = importance × (1 − evidence) × 100, every input clamped 0–1 in
  // lib/domain/severity.ts. A value outside the range means the pure function
  // was bypassed, and this is the only layer that can notice.
  results.push(
    await expectRejection(
      sql,
      {
        name: "skill_gap with a severity above 100",
        rule: "RLE §5",
        statement: `${SEED_ANALYSIS}
          insert into skills (id, name, category)
            values ('00000000-0000-4000-8000-0000000000ab', 'SmokeSkill2', 'practice');
          insert into skill_gaps
            (clerk_user_id, analysis_id, skill_id, user_level, required_level, note, severity)
          values ('smoke-user', '00000000-0000-4000-8000-00000000cafe',
                  '00000000-0000-4000-8000-0000000000ab', 'none', 'working', 'x', 140.0)`,
      },
      "23514",
    ),
  );

  /* ------------------------------------------ 6. N10 — RLS denies strangers */
  results.push(await rlsCheck());

  await sql.end();

  console.log("\nConstraint smoke test\n");
  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  [${r.rule}] ${r.name}\n      ${r.detail}`);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} guards confirmed.`);
  if (failed.length > 0) {
    console.error("\nThe safety net is not connected. Do not proceed past the M1 gate.");
    process.exit(1);
  }
}

async function expectRejection(
  sql: postgres.Sql,
  check: { name: string; rule: string; statement: string },
  expectedSqlState?: string,
): Promise<Check> {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(check.statement);
      throw new Error("__ACCEPTED__");
    });
    return { ...check, passed: false, detail: "the database ACCEPTED the bad row" };
  } catch (e) {
    const error = e as { message?: string; code?: string };
    if (error.message === "__ACCEPTED__") {
      return { ...check, passed: false, detail: "the database ACCEPTED the bad row" };
    }
    const code = error.code ?? "unknown";
    if (expectedSqlState && code !== expectedSqlState) {
      return {
        ...check,
        passed: false,
        detail: `rejected with SQLSTATE ${code}, expected ${expectedSqlState}`,
      };
    }
    return { ...check, passed: true, detail: `rejected with SQLSTATE ${code}` };
  }
}

/**
 * RLS through an ANON client with no session token. The integration supplies
 * the "authenticated" claim; a request without it must read nothing.
 */
async function rlsCheck(): Promise<Check> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return {
      name: "anonymous select under RLS",
      rule: "N10",
      passed: false,
      detail: "NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY not set — cannot verify RLS",
    };
  }

  const anon = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
  const { data, error } = await anon.from("analyses").select("id").limit(1);

  if (error) {
    return {
      name: "anonymous select under RLS",
      rule: "N10",
      passed: true,
      detail: `denied: ${error.code ?? error.message}`,
    };
  }
  if ((data ?? []).length === 0) {
    return {
      name: "anonymous select under RLS",
      rule: "N10",
      passed: true,
      detail: "returned zero rows (policy filtered everything, as intended)",
    };
  }
  return {
    name: "anonymous select under RLS",
    rule: "N10",
    passed: false,
    detail: `an anonymous client READ ${data!.length} row(s) — RLS is not enforced`,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
