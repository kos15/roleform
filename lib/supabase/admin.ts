import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ONLY.
 *
 * If this module ever appears in a client bundle that is a security incident,
 * not a bug (CLAUDE.md §10). The `server-only` import above turns that mistake
 * into a build failure rather than a shipped key.
 *
 * Legitimate callers: Clerk webhook handling, catalog seeding, admin scripts,
 * and export writes that must outlive the request's RLS context.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
