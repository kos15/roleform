/**
 * Prisma CLI config (migrate, generate, studio). Only the CLI reads this —
 * the app itself gets its own env from Next.js's built-in .env.local loading,
 * and connects through the `@prisma/adapter-pg` driver adapter in lib/db/index.ts
 * (Prisma 7 removed `datasource.url`/`directUrl` from schema.prisma — see
 * https://pris.ly/d/prisma7-client-config).
 *
 * `dotenv/config` defaults to `.env`, which this repo doesn't use (.env.example
 * documents `.env.local` as the one real env file, per scripts/env.ts). Load
 * `.env.local` explicitly so `prisma migrate` sees DIRECT_URL.
 *
 * DIRECT_URL, not DATABASE_URL: migrate needs a real session, which the
 * transaction-mode pgbouncer pooler behind DATABASE_URL cannot provide.
 */
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL,
  },
});
