/**
 * Limiteur de débit en mémoire (fenêtre fixe), suffisant pour un seul conteneur.
 */
export interface RateLimiter {
  hit(key: string): { allowed: boolean; retryAfterSec: number };
  reset(key: string): void;
}

export function createRateLimiter(opts: { windowMs: number; max: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function cleanup(t: number) {
    if (buckets.size < 1000) return;
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
  }

  return {
    hit(key) {
      const t = now();
      cleanup(t);
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        bucket = { count: 0, resetAt: t + opts.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= opts.max;
      return { allowed, retryAfterSec: allowed ? 0 : Math.ceil((bucket.resetAt - t) / 1000) };
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}
