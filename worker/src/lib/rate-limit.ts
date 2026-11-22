import { apiError } from "./http";
import { ipHash } from "./ip";

/**
 * Per-IP limits on top of Workers Rate Limiting bindings (wrangler.jsonc,
 * period 60 s). The key is the daily-salted IP hash, so the limiter never
 * sees a raw IP. Generous on purpose: a café's wifi or a mobile carrier's NAT
 * puts many people behind one IP.
 *
 * Ported from fm/lane2-chat-safety (apps/api/src/safety/guard.ts, ipLimited).
 */
export const IP_LIMITS_PER_MINUTE = {
  LIMIT_READ: 300,
  LIMIT_EVENTS: 60,
} as const;

export type LimiterName = keyof typeof IP_LIMITS_PER_MINUTE;

/**
 * True when this IP is over the limiter's per-minute limit. Without the
 * binding, without a usable IP, or on a limiter error it lets the request
 * through: availability wins over a perfect count.
 */
export async function ipLimited(env: object, name: LimiterName, hash: string | null): Promise<boolean> {
  const limiter = (env as Record<string, RateLimit | undefined>)[name];
  if (!limiter || !hash) return false;
  try {
    const { success } = await limiter.limit({ key: hash });
    return !success;
  } catch {
    console.warn(`[rate-limit] ${name} failed`);
    return false;
  }
}

/** A 429 response when the request's IP is over the limit, else null. */
export async function limitByIp(env: Env, request: Request, name: LimiterName): Promise<Response | null> {
  let hash: string | null = null;
  try {
    hash = await ipHash(env.DB, request);
  } catch {
    console.warn("[rate-limit] ip hash unavailable");
  }
  if (await ipLimited(env, name, hash)) return apiError("rate_limited", "Too many requests, try again in a moment.", 429);
  return null;
}
