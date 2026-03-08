import type { NextRequest } from "next/server";

/**
 * Extract the real client IP from a request, respecting TRUSTED_PROXY_DEPTH.
 * Uses the same logic as middleware.ts to prevent IP spoofing via forged
 * X-Forwarded-For headers.
 *
 * - TRUSTED_PROXY_DEPTH=0: Ignore X-Forwarded-For (direct exposure, no proxy)
 * - TRUSTED_PROXY_DEPTH=1 (default): One proxy layer — use last IP in chain
 * - TRUSTED_PROXY_DEPTH=2: Two proxy layers — use second-to-last IP
 */
export function getClientIp(req: NextRequest): string {
  const PROXY_DEPTH = Math.max(0, Number(process.env.TRUSTED_PROXY_DEPTH ?? 1));
  if (PROXY_DEPTH > 0) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const ips = forwarded.split(",").map((s) => s.trim());
      const idx = Math.max(0, ips.length - PROXY_DEPTH);
      return ips[idx] ?? "unknown";
    }
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Create an in-memory per-IP rate limiter with automatic stale entry cleanup.
 * Suitable for serverless route handlers (state resets on cold starts).
 *
 * @param maxRequests - Maximum requests allowed within the window
 * @param windowMs - Window duration in milliseconds (default: 1 hour)
 */
export function createRateLimiter(maxRequests: number, windowMs = 3600_000) {
  const rateMap = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    // Probabilistic cleanup of stale entries to prevent unbounded memory growth
    if (Math.random() < 0.01) {
      for (const [key, val] of rateMap) {
        if (now > val.resetAt) rateMap.delete(key);
      }
    }
    const entry = rateMap.get(ip);
    if (!entry || now > entry.resetAt) {
      rateMap.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    if (entry.count >= maxRequests) return true;
    entry.count++;
    return false;
  };
}
