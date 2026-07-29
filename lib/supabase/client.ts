import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Anon Supabase client bound to the Clerk session via the NATIVE third-party
 * auth integration (CLAUDE.md §7).
 *
 * The old JWT-template approach was deprecated 2025-04-01 and is not used here:
 * `accessToken` hands Supabase the Clerk session token directly, so there is no
 * per-request token fetch and Clerk never holds the Supabase JWT secret.
 *
 * The token carries "role": "authenticated"; requests without it are anonymous
 * and RLS denies them.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const { getToken } = await auth();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => (await getToken()) ?? "" },
  );
}

/** Browser client. Pass the Clerk session token getter from `useAuth()`. */
export function createBrowserSupabase(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { accessToken: async () => (await getToken()) ?? "" },
  );
}
