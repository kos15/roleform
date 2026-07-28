/**
 * Stub for the `server-only` marker package, used ONLY by scripts.
 *
 * The real package throws unless it is resolved under React's `react-server`
 * condition — which is exactly the guard we want in the app, and exactly what
 * a plain Node script cannot satisfy. Turning that condition on globally is not
 * an option either: @react-pdf's reconciler needs the standard React build.
 *
 * tsconfig.scripts.json maps `server-only` here, so the app keeps the real
 * guard (a client component importing lib/supabase/admin.ts still fails the
 * build) while scripts can call the same server modules directly.
 */
export {};
