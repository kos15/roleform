import "server-only";
import { createHash } from "node:crypto";

/**
 * N7: the address itself is never stored, only enough to de-duplicate.
 *
 * Its own module so the three doors into an account — `provisionUser`, the
 * Clerk webhook and the admin panel's directory sync — share one hash without
 * lib/admin/members.ts importing lib/services/auth.ts, which already imports it.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex");
}
