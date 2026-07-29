import "server-only";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client over the Supabase Postgres connection, via the `pg` driver
 * adapter (Prisma 7 requires an explicit adapter — see prisma.config.ts).
 *
 * This connection uses `DATABASE_URL` (the pooled, pgbouncer connection) and
 * database credentials, which bypass RLS — so every query issued through it
 * MUST be scoped by the session subject in the calling Server Action
 * (CLAUDE.md §7: "RLS is the second lock, not the only one"). Client-side
 * reads go through lib/supabase/client.ts instead, where RLS applies.
 *
 * ORM choice: Prisma over the previous Drizzle setup, so switching database
 * providers later stays a schema + adapter change, not a rewrite of every
 * query. Table and column names are @@map/@map'd in prisma/schema.prisma to
 * match the snake_case names lib/db/policies.sql already references, so RLS
 * never has to change when the ORM does.
 */
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const db = globalForDb.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;
