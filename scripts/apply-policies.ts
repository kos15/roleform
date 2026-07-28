/**
 * Applies lib/db/policies.sql. Run after every migration.
 *
 * RLS policies live in the repo and are applied by script — never clicked into
 * the Supabase dashboard (CLAUDE.md §13). A policy you cannot diff is a policy
 * you cannot trust, and with light testing RLS *is* the security model.
 */
import "./env";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });
  const statements = readFileSync(join(process.cwd(), "lib/db/policies.sql"), "utf8");

  await sql.unsafe(statements);
  console.log("policies applied");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
