import type { Context, Next } from 'hono';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

interface RateLimitMiddlewareOptions {
  windowMs: number;
  max: number;
  keyFor?: (c: Context<{ Bindings: Env }>) => string;
}

const FALLBACK_KEY = 'unknown';

/** Resolves a per-request limiter key: client IP when available, else a shared bucket. */
function defaultKeyFor(c: Context<{ Bindings: Env }>): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || FALLBACK_KEY;
  return FALLBACK_KEY;
}

/**
 * Fixed-window rate limiter persisted in D1.
 * One row per key; `lastRequest` stores the current window start, so counts
 * reset automatically when the window rolls over. Uses the same `rateLimit`
 * table as better-auth with distinct (route-prefixed) keys.
 */
export async function enforceRateLimit(
  env: Env,
  key: string,
  windowMs: number,
  max: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const db = env.DB;

  await db
    .prepare(
      `INSERT INTO rateLimit (id, key, count, lastRequest) VALUES (?, ?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN lastRequest < ? THEN 1 ELSE count + 1 END,
         lastRequest = ?`
    )
    .bind(crypto.randomUUID(), key, windowStart, windowStart, windowStart)
    .run();

  const row = await db
    .prepare(`SELECT count FROM rateLimit WHERE key = ?`)
    .bind(key)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetMs: windowStart + windowMs - now,
  };
}

/** Hono middleware that rejects requests over the configured limit with a 429. */
export function rateLimitMiddleware({ windowMs, max, keyFor }: RateLimitMiddlewareOptions) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const key = `${c.req.path}:${keyFor ? keyFor(c) : defaultKeyFor(c)}`;
    const result = await enforceRateLimit(c.env, key, windowMs, max);
    if (!result.allowed) {
      c.header('retry-after', String(Math.ceil(result.resetMs / 1000)));
      return c.json({ error: 'Too Many Requests', retryAfterMs: result.resetMs }, 429);
    }
    await next();
  };
}
