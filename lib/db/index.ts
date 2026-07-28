import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle client over the Supabase Postgres connection.
 *
 * This connection uses the database credentials, which bypass RLS — so every
 * query issued through it MUST be scoped by the session subject in the calling
 * Server Action (CLAUDE.md §7: "RLS is the second lock, not the only one").
 * Client-side reads go through lib/supabase/client.ts instead, where RLS applies.
 */
const globalForDb = globalThis as unknown as { conn?: postgres.Sql };

const conn =
  globalForDb.conn ??
  postgres(process.env.DATABASE_URL!, { max: 5, prepare: false, connect_timeout: 15 });

if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export { schema };
