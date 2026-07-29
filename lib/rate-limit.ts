import "server-only";

/**
 * Per-user and per-IP rate limiting on LLM endpoints (M7.9).
 *
 * In-memory, per-instance. Honest about what that means: on Vercel this limits
 * each lambda instance rather than the fleet, so it stops a runaway client and
 * an accidental retry loop, not a determined attacker. The per-user monthly
 * quota (lib/auth.ts) is the real spend ceiling; this is the burst guard.
 *
 * Move to Redis/Upstash when the quota stops being the binding constraint.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  if (buckets.size > 5000) sweep(now);
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}

export const LIMITS = {
  /** A full analysis is expensive; six per hour per user is generous in practice. */
  analysis: { limit: 6, windowSeconds: 3600 },
  upload: { limit: 10, windowSeconds: 3600 },
  /** One mid-tier call per worked answer — cheap, but not free, and clickable. */
  answer: { limit: 60, windowSeconds: 3600 },
  export: { limit: 40, windowSeconds: 3600 },
} as const;
