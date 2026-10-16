"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

/**
 * Keeps server-rendered chrome in step with the Clerk session.
 *
 * Signing in or out happens in the browser, but every layout here is a Server
 * Component that read `auth()` when it rendered — and Next's client router
 * cache keeps those payloads, including a prefetched `/analyze` that was a
 * redirect to /sign-in while signed out. After Clerk navigated, the page
 * showed the signed-out version (or bounced back to sign-in) until a manual
 * reload. A session change now refreshes the router, which drops that cache
 * and re-renders the server tree with the new session.
 */
export function AuthStateSync() {
  const { isLoaded, userId } = useAuth();
  const router = useRouter();
  const last = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    const current = userId ?? null;
    if (last.current !== undefined && last.current !== current) router.refresh();
    last.current = current;
  }, [isLoaded, userId, router]);

  return null;
}
