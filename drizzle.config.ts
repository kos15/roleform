import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  // RLS policies live in lib/db/policies.sql and are applied by `pnpm db:policies`.
  // They are never clicked into the Supabase dashboard (CLAUDE.md §13).
} satisfies Config;
