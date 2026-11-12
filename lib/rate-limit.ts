/**
 * Fixed-window rate limiter.
 *
 * Serverless deployments run several independent instances, so this store is
 * per-instance best effort: it stops a single client hammering one instance,
 * but it is not a distributed quota. It requires no new infrastructure and
 * keeps the app working when no KV/Redis is configured.
 */

type Bucket = { count: number; resetAt: number };
type Store = Map<string, Bucket>;

// Survive dev HMR re-evaluations, which would otherwise reset every window.
const globalForLimits = globalThis as unknown as {
  __splitmateRateLimits?: Store;
};
const store: Store =
  globalForLimits.__splitmateRateLimits ?? new Map<string, Bucket>();
globalForLimits.__splitmateRateLimits = store;

const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = { ok: boolean; retryAfter: number };

function prune(now: number) {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  if (store.size > MAX_TRACKED_KEYS) prune(now);

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

/** Forget a key, e.g. after a successful password login. */
export function resetRateLimit(key: string) {
  store.delete(key);
}

/** Best-effort client IP: Vercel sets `x-forwarded-for` on every request. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
