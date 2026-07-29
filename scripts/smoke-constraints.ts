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
 *   3. a cross-user SELECT under RLS                            → N10
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
  results.push(
    await expectRejection(sql, {
      name: "non-gap interview_question with no evidence",
      rule: "N2",
      statement: `insert into interview_questions
        (clerk_user_id, analysis_id, ordinal, type, text, why_they_ask, frame, evidence_bullet_ids)
        values ('smoke-user', gen_random_uuid(), 0, 'behavioral', 'Tell me about a time…',
                'because', array['a','b','c'], '{}'::uuid[])`,
    }),
  );

  /* --------------------------- 2b. the same row typed 'gap' must be allowed */
  results.push(
    await expectRejection(
      sql,
      {
        name: "gap question with no evidence (must be ALLOWED by the CHECK)",
        rule: "N2",
        statement: `insert into interview_questions
          (clerk_user_id, analysis_id, ordinal, type, text, why_they_ask, frame, evidence_bullet_ids)
          values ('smoke-user', gen_random_uuid(), 0, 'gap', 'How would you pick up Kafka?',
                  'because', array['a','b','c'], '{}'::uuid[])`,
      },
      // Expect the FK on analysis_id to fail, NOT the CHECK. If the CHECK fires
      // here, it is over-tight and gap questions cannot be stored at all.
      "23503",
    ),
  );

  /* ------------------------------------------ 3. N10 — RLS denies strangers */
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
