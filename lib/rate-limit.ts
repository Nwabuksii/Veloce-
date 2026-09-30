import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security-log";

const RATE_LIMIT_KEY_PREFIX = "veloce:rate-limit";

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

// One atomic step on the Redis side: increment the counter and, if this is
// the first hit of a window, start its expiry — in a single script so there
// is no gap between the two where a crash could leave a counter that never
// expires (which would lock someone out permanently).
const INCR_WITH_EXPIRY_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Rate limiting is intentionally kept behind the same function signature as
 * before so the rest of the app never needs to know whether requests are
 * being counted in Redis or in the fallback Prisma table.
 *
 * Upstash Redis is preferred because it decouples rate-limit counters from the
 * application database and avoids writing extra Postgres traffic on every
 * login/signup/purchase request. If the service is not configured, the app
 * safely falls back to the existing DB-backed table for local/dev work.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const redis = getRedisClient();

  if (redis) {
    // Fixed window: the first hit starts the clock, every later hit in the
    // window is counted atomically. The old version read the JSON counter,
    // added one and wrote it back — so N parallel requests all read the same
    // count and all got through. A new key prefix (rl2) also keeps this off
    // any leftover JSON-valued keys from the old scheme, which INCR would
    // reject; those simply expire on their own.
    const count = Number(
      await redis.eval(INCR_WITH_EXPIRY_LUA, [`${RATE_LIMIT_KEY_PREFIX}:rl2:${key}`], [Math.max(1, Math.ceil(windowMs))])
    );
    return count <= limit;
  }

  // Local/dev fallback (no Redis configured): the same "increment or reset"
  // decision made inside ONE SQL statement, so it is atomic here too.
  const windowCutoff = new Date(Date.now() - windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitHit" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitHit"."windowStart" < ${windowCutoff} THEN 1 ELSE "RateLimitHit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitHit"."windowStart" < ${windowCutoff} THEN NOW() ELSE "RateLimitHit"."windowStart" END
    RETURNING "count"
  `;
  return Number(rows[0]?.count ?? 1) <= limit;
}

/** Builds a per-IP rate-limit key. Falls back to "unknown" if no forwarded IP
 * header is present (e.g. local dev) — that just means local dev shares one
 * bucket, which is fine since it's never internet-facing. */
export function ipKeyFrom(req: Request, bucket: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${bucket}:${ip}`;
}

/**
 * The check-then-reject pattern every limited route repeats, in one place:
 * returns a ready-made 429 when `key` is over its limit, otherwise null.
 *
 *   const blocked = await rateLimitResponse(`upload:${user.sub}`, 10, HOUR, "Too many uploads.");
 *   if (blocked) return blocked;
 */
export async function rateLimitResponse(
  key: string,
  limit: number,
  windowMs: number,
  message: string
): Promise<NextResponse | null> {
  if (await checkRateLimit(key, limit, windowMs)) return null;
  // Only the bucket name (the part before the first ":") — the rest of the
  // key is a user id or address.
  await logSecurityEvent("rate_limited", { bucket: key.split(":")[0] }, "warn");
  return NextResponse.json({ error: message }, { status: 429 });
}
