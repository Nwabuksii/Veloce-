import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_KEY_PREFIX = "veloce:rate-limit";

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Redis({ url, token });
}

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
  const now = Date.now();
  const redis = getRedisClient();
  const rateLimitKey = `${RATE_LIMIT_KEY_PREFIX}:${key}`;

  if (redis) {
    const existing = (await redis.get<{ count: number; windowStart: number }>(rateLimitKey)) ?? null;
    const windowExpired = !existing || now - existing.windowStart > windowMs;

    if (windowExpired) {
      await redis.set(rateLimitKey, { count: 1, windowStart: now }, { ex: Math.max(1, Math.ceil(windowMs / 1000)) });
      return true;
    }

    if (existing.count >= limit) {
      return false;
    }

    const next = { count: existing.count + 1, windowStart: existing.windowStart };
    await redis.set(rateLimitKey, next, { ex: Math.max(1, Math.ceil(windowMs / 1000)) });
    return true;
  }

  const existing = await prisma.rateLimitHit.findUnique({ where: { key } });
  const windowExpired = !existing || now - existing.windowStart.getTime() > windowMs;

  if (windowExpired) {
    await prisma.rateLimitHit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: new Date(now) },
      update: { count: 1, windowStart: new Date(now) },
    });
    return true;
  }

  if (existing.count >= limit) {
    return false;
  }

  await prisma.rateLimitHit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}

/** Builds a per-IP rate-limit key. Falls back to "unknown" if no forwarded IP
 * header is present (e.g. local dev) — that just means local dev shares one
 * bucket, which is fine since it's never internet-facing. */
export function ipKeyFrom(req: Request, bucket: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${bucket}:${ip}`;
}
